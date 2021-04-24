import ConduitGrpcSdk from '@quintessential-sft/conduit-grpc-sdk';
import { ConduitCommons } from '@quintessential-sft/conduit-commons';
import { Request, Response } from 'express';
import { isNil, isEmpty } from 'lodash';

export class AdminHandlers {
  private readonly database: any;

  constructor(
    private readonly grpcSdk: ConduitGrpcSdk,
    private readonly sdk: ConduitCommons
  ) {
    this.database = grpcSdk.databaseProvider;
  }

  async getModules(req: Request, res: Response) {
    const registeredModules = (req as any).conduit.registeredModules;
    if (registeredModules.size !== 0) {
      let modules: any[] = [];
      registeredModules.forEach((value: string, key: string) => {
        modules.push({
          moduleName: key,
          url: value,
        });
      });
      return res.json({ modules });
    } else {
      return res.status(404).json({ message: 'Modules not available' });
    }
  }

  async getConfig(req: Request, res: Response) {
    const registeredModules: Map<string, string> = (req as any).conduit.registeredModules;

    const dbConfig = await this.database.findOne('Config', {});
    if (isNil(dbConfig)) {
      return res.json({});
    }

    let finalConfig: any;
    const module = req.params.module;

    switch (module) {
      case undefined:
        finalConfig = dbConfig;
        delete finalConfig._id;
        delete finalConfig.createdAt;
        delete finalConfig.updatedAt;
        delete finalConfig.__v;
        break;
      case 'authentication':
        if (!registeredModules.has(module))
          return res.json({ message: 'Module not available' });
        finalConfig = dbConfig.moduleConfigs.authentication;
        break;
      case 'email':
        if (!registeredModules.has(module))
          return res.json({ message: 'Module not available' });
        finalConfig = dbConfig.moduleConfigs.email;
        break;
      case 'storage':
        if (!registeredModules.has(module))
          return res.json({ message: 'Module not available' });
        finalConfig = dbConfig.moduleConfigs.storage;
        break;
      case 'push-notifications':
        if (!registeredModules.has(module))
          return res.json({ message: 'Module not available' });
        finalConfig = dbConfig.moduleConfigs.pushNotifications;
        break;
      case 'core':
        finalConfig = dbConfig.moduleConfigs.core;
        break;
      default:
        return res.status(404).json({ error: 'Resource not found' });
    }

    if (isEmpty(finalConfig)) return res.json({ active: false });
    return res.json(finalConfig);
  }

  async setConfig(req: Request, res: Response) {
    const registeredModules: Map<string, string> = (req as any).conduit.registeredModules;

    const dbConfig = await this.database.findOne('Config', {});
    if (isNil(dbConfig)) {
      return res.status(404).json({ error: 'Config not set' });
    }

    const newConfig = req.body;
    const moduleName = req.params.module;
    let errorMessage: string | null = null;
    let updatedConfig: any;

    if (newConfig.active === false)
      return res.status(403).json({ error: 'Modules cannot be deactivated' });
    await this.grpcSdk
      .initializeModules()
      .catch((err) => console.log('Failed to refresh modules'));
    switch (moduleName) {
      case undefined:
        return res.status(400).json({ error: 'Module Name missing' });
      case 'authentication':
        if (!registeredModules.has(moduleName) || isNil(this.grpcSdk.authentication))
          return res.json({ message: 'Module not available' });
        updatedConfig = await this.grpcSdk.authentication
          .setConfig(newConfig)
          .catch((e: Error) => (errorMessage = e.message));
        break;
      case 'email':
        if (!registeredModules.has(moduleName) || isNil(this.grpcSdk.emailProvider))
          return res.json({ message: 'Module not available' });
        updatedConfig = await this.grpcSdk.emailProvider
          .setConfig(newConfig)
          .catch((e: Error) => (errorMessage = e.message));
        break;
      case 'push-notifications':
        if (!registeredModules.has(moduleName) || isNil(this.grpcSdk.pushNotifications))
          return res.json({ message: 'Module not available' });
        updatedConfig = this.grpcSdk.pushNotifications
          .setConfig(newConfig)
          .catch((e: Error) => (errorMessage = e.message));
        break;
      case 'storage':
        if (!registeredModules.has(moduleName) || isNil(this.grpcSdk.storage))
          return res.json({ message: 'Module not available' });
        updatedConfig = this.grpcSdk.storage
          .setConfig(newConfig)
          .catch((e: Error) => (errorMessage = e.message));
        break;
      case 'core':
        updatedConfig = await this.sdk
          .getConfigManager()
          .set('core', newConfig)
          .catch((e: Error) => (errorMessage = e.message));
        break;
      default:
        return res.status(404).json({ error: 'Resource not found' });
    }

    if (!isNil(errorMessage)) return res.status(403).json({ error: errorMessage });
    return res.json(updatedConfig);
  }
}
