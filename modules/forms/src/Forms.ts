import {
  ConfigController,
  DatabaseProvider,
  HealthCheckStatus,
  ManagedModule,
} from '@conduitplatform/grpc-sdk';
import AppConfigSchema, { Config } from './config';
import { FormSubmissionTemplate } from './templates';
import { AdminHandlers } from './admin/admin';
import { FormsRoutes } from './routes/routes';
import { FormsController } from './controllers/forms.controller';
import * as models from './models';
import path from 'path';
import { runMigrations } from './migrations';

export default class Forms extends ManagedModule<Config> {
  config = AppConfigSchema;
  service = {
    protoPath: path.resolve(__dirname, 'forms.proto'),
    protoDescription: 'forms.Forms',
    functions: {
      setConfig: this.setConfig.bind(this),
    },
  };
  private isRunning: boolean = false;
  private adminRouter: AdminHandlers;
  private userRouter: FormsRoutes;
  private database: DatabaseProvider;
  private formController: FormsController;

  constructor() {
    super('forms');
    this.updateHealth(HealthCheckStatus.UNKNOWN, true);
  }

  async onServerStart() {
    this.database = this.grpcSdk.databaseProvider!;
    await runMigrations(this.grpcSdk);
    await this.grpcSdk.monitorModule('email', serving => {
      if (serving && ConfigController.getInstance().config.active) {
        this.updateHealth(HealthCheckStatus.SERVING);
      } else {
        this.updateHealth(HealthCheckStatus.NOT_SERVING);
      }
    });
  }

  async onRegister() {
    this.grpcSdk.bus!.subscribe('email:status:onConfig', (message: string) => {
      if (message === 'active') {
        this.onConfig()
          .then(() => {
            console.log('Updated forms configuration');
          })
          .catch(() => {
            console.log('Failed to update forms config');
          });
      }
    });
  }

  async onConfig() {
    if (!ConfigController.getInstance().config.active) {
      this.updateHealth(HealthCheckStatus.NOT_SERVING);
    } else {
      if (!this.isRunning) {
        await this.registerSchemas();
        await this.grpcSdk.emailProvider!.registerTemplate(FormSubmissionTemplate);
        this.userRouter = new FormsRoutes(this.grpcServer, this.grpcSdk);
        this.formController = new FormsController(
          this.grpcSdk,
          this.userRouter,
          this.userRouter._routingManager,
        );
        this.adminRouter = new AdminHandlers(
          this.grpcServer,
          this.grpcSdk,
          this.formController,
        );
        this.isRunning = true;
      }
      this.updateHealth(HealthCheckStatus.SERVING);
    }
  }

  protected registerSchemas() {
    const promises = Object.values(models).map(model => {
      const modelInstance = model.getInstance(this.database);
      return this.database.createSchemaFromAdapter(modelInstance);
    });
    return Promise.all(promises);
  }
}
