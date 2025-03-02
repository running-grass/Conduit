import { GrpcServer } from '@conduitplatform/grpc-sdk';

export abstract class IConfigManager {
  abstract initialize(server: GrpcServer): Promise<void>;
  abstract initConfigAdminRoutes(): void;
  abstract registerAppConfig(): Promise<any>;
  abstract registerModulesConfig(moduleName: string, moduleConfig: any): Promise<any>;
  abstract get(moduleName: string): Promise<any>;
  abstract set(moduleName: string, moduleConfig: any): Promise<any>;
  abstract addFieldsToModule(moduleName: string, moduleConfig: any): Promise<any>;
  abstract getModuleUrlByName(moduleName: string): string | undefined;
}
