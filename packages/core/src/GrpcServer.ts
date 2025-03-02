import { ConduitCommons } from '@conduitplatform/commons';
import ConduitGrpcSdk, {
  HealthCheckStatus,
  GrpcServer as ConduitGrpcServer,
  GrpcRequest,
  GrpcCallback,
} from '@conduitplatform/grpc-sdk';
import ConfigManager from '@conduitplatform/config';
import AdminModule from '@conduitplatform/admin';
import SecurityModule from '@conduitplatform/security';
import { ConduitDefaultRouter } from '@conduitplatform/router';
import { Core } from './Core';
import { EventEmitter } from 'events';
import path from 'path';
import convict from './config';
import { ServerWritableStream } from '@grpc/grpc-js';
import { HealthCheckRequest } from '@conduitplatform/grpc-sdk/dist/protoUtils/grpc_health_check';

const CORE_SERVICES = ['Config', 'Admin', 'Router'];

export class GrpcServer {
  private readonly server: ConduitGrpcServer;
  private readonly events: EventEmitter;
  private _serviceHealthState: HealthCheckStatus = HealthCheckStatus.UNKNOWN;
  private _initialized = false;

  get initialized() {
    return this._initialized;
  }

  constructor(private readonly commons: ConduitCommons, private readonly port: number) {
    this.events = new EventEmitter();
    this.events.setMaxListeners(150);
    this.server = new ConduitGrpcServer(this.port.toString());
    this.server
      .createNewServer()
      .then(port => {
        const _url = '0.0.0.0:' + port.toString();
        const grpcSdk = new ConduitGrpcSdk(
          _url,
          () => {
            return this._serviceHealthState;
          },
          'core',
          false,
        );
        grpcSdk.initialize().then(async () => {
          this.commons.registerConfigManager(
            new ConfigManager(grpcSdk, this.commons, async () => {
              if (!this._initialized) {
                await this.bootstrapSdkComponents(grpcSdk);
              }
            }),
          );
          await this.commons.getConfigManager().initialize(this.server);
          this.server.start();
          console.log('gRPC server listening on:', _url);
        });
      })
      .then(() => {
        return this.addHealthService();
      })
      .then()
      .catch(err => {
        console.error(err);
        process.exit(-1);
      });
  }

  private async bootstrapSdkComponents(grpcSdk: ConduitGrpcSdk) {
    this.commons.registerAdmin(new AdminModule(this.commons, grpcSdk));
    this.commons.registerRouter(
      new ConduitDefaultRouter(
        this.commons,
        grpcSdk,
        Core.getInstance().httpServer.expressApp,
      ),
    );
    Core.getInstance().httpServer.initialize();
    Core.getInstance().httpServer.start();
    await this.commons.getConfigManager().registerAppConfig();
    let error;
    this.commons
      .getConfigManager()
      .get('core')
      .catch((err: Error) => (error = err));
    if (error) {
      await this.commons
        .getConfigManager()
        .registerModulesConfig('core', convict.getProperties());
    } else {
      await this.commons
        .getConfigManager()
        .addFieldsToModule('core', convict.getProperties());
    }
    await this.commons.getAdmin().initialize(this.server);
    await this.commons.getRouter().initialize(this.server);
    this.server.refresh().then();
    this.commons.getConfigManager().initConfigAdminRoutes();
    this.commons.registerSecurity(new SecurityModule(this.commons, grpcSdk));

    this._initialized = true;
    this.serviceHealthState = HealthCheckStatus.SERVING;
  }

  private getServiceHealthState(service: string) {
    service = service.replace('conduit.core.', '');
    if (service && !CORE_SERVICES.includes(service)) {
      return HealthCheckStatus.SERVICE_UNKNOWN;
    }
    return this._serviceHealthState;
  }

  private set serviceHealthState(
    state: Exclude<
      HealthCheckStatus,
      HealthCheckStatus.SERVICE_UNKNOWN | HealthCheckStatus.UNKNOWN
    >,
  ) {
    if (this._serviceHealthState !== state) {
      this.events.emit('grpc-health-change:Core', state);
    }
    this._serviceHealthState = state;
  }

  private addHealthService() {
    return this.server.addService(
      path.resolve(__dirname, './grpc_health_check.proto'),
      'grpc.health.v1.Health',
      {
        Check: this.healthCheck.bind(this),
        Watch: this.healthWatch.bind(this),
      },
    );
  }

  private healthCheck(
    call: GrpcRequest<{ service: string }>,
    callback: GrpcCallback<{ status: HealthCheckStatus }>,
  ) {
    callback(null, { status: this.getServiceHealthState(call.request.service) });
  }

  private healthWatch(
    call: ServerWritableStream<{ service: string }, { status: HealthCheckStatus }>,
  ) {
    const healthState = this.getServiceHealthState(call.request.service);
    if (healthState === HealthCheckStatus.SERVICE_UNKNOWN) {
      call.write({ status: HealthCheckStatus.SERVICE_UNKNOWN });
    } else {
      this.events.on('grpc-health-change:Core', (status: HealthCheckStatus) => {
        call.write({ status });
      });
    }
  }
}
