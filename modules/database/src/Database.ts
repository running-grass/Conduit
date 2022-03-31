import {
  ManagedModule,
  ConduitSchema,
  GrpcError,
} from '@conduitplatform/grpc-sdk';

import { AdminHandlers } from './admin/admin';
import { DatabaseRoutes } from './routes/routes';
import * as models from './models';
import { DatabaseAdapter } from './adapters/DatabaseAdapter';
import { MongooseAdapter } from './adapters/mongoose-adapter';
import { SequelizeAdapter } from './adapters/sequelize-adapter';
import { MongooseSchema } from './adapters/mongoose-adapter/MongooseSchema';
import { SequelizeSchema } from './adapters/sequelize-adapter/SequelizeSchema';
import { SchemaAdapter } from './interfaces';
import { canCreate, canDelete, canModify } from './permissions';
import { runMigrations } from './migrations';
import { SchemaController } from './controllers/cms/schema.controller';
import { CustomEndpointController } from './controllers/customEndpoints/customEndpoint.controller';
import path from 'path';
import { status } from '@grpc/grpc-js';
import {
  DatabaseProviderDefinition,
  DeepPartial,
  GetSchemaResponse,
  GetSchemasResponse,
  SetSchemaExtensionRequest,
  QueryResponse,
  QueryRequest,
  CreateSchemaRequest,
  GetSchemaRequest,
  GetSchemasRequest,
  DropCollectionRequest,
  DropCollectionResponse,
  FindOneRequest,
  FindRequest,
  UpdateManyRequest,
  UpdateRequest,
} from '../protoUtils/database';

import { ServiceImplementation } from 'nice-grpc';

export default class DatabaseModule extends ManagedModule {
  config = undefined;
  service = {
    protoPath: path.resolve(__dirname, 'database.proto'),
    protoDescription: 'database.DatabaseProvider',
    functions: {
      createSchemaFromAdapter: this.createSchemaFromAdapter.bind(this),
      getSchema: this.getSchema.bind(this),
      getSchemas: this.getSchemas.bind(this),
      deleteSchema: this.deleteSchema.bind(this),
      setSchemaExtension: this.setSchemaExtension.bind(this),
      findOne: this.findOne.bind(this),
      findMany: this.findMany.bind(this),
      create: this.create.bind(this),
      createMany: this.createMany.bind(this),
      findByIdAndUpdate: this.findByIdAndUpdate.bind(this),
      updateMany: this.updateMany.bind(this),
      deleteOne: this.deleteOne.bind(this),
      deleteMany: this.deleteMany.bind(this),
      countDocuments: this.countDocuments.bind(this),
    } as ServiceImplementation<typeof DatabaseProviderDefinition>
  };

  private adminRouter: AdminHandlers;
  private userRouter: DatabaseRoutes;
  protected readonly _activeAdapter: DatabaseAdapter<MongooseSchema | SequelizeSchema>;

  constructor(dbType: string, dbUri: string) {
    super('database',DatabaseProviderDefinition);
    if (dbType === 'mongodb') {
      this._activeAdapter = new MongooseAdapter(dbUri);
    } else if (dbType === 'postgres' || dbType === 'sql') { // Compat (<=0.12.2): sql
      this._activeAdapter = new SequelizeAdapter(dbUri);
    } else {
      throw new Error('Database type not supported');
    }
  }

  async preServerStart() {
    await this._activeAdapter.ensureConnected();
  }

  async onServerStart() {
    await this._activeAdapter.createSchemaFromAdapter(models.DeclaredSchema);
    const modelPromises = Object.values(models).flatMap((model: any) => {
      if (model.name === '_DeclaredSchema') return [];
      return this._activeAdapter.createSchemaFromAdapter(model);
    });
    await Promise.all(modelPromises);
    await runMigrations(this._activeAdapter);
    await this._activeAdapter.recoverSchemasFromDatabase();
    this.userRouter = new DatabaseRoutes(this.grpcServer, this._activeAdapter, this.grpcSdk);
  }

  async onRegister() {
    const self = this;
    self.grpcSdk.bus?.subscribe('database', (message: string) => {
      if (message === 'request') {
        self._activeAdapter.registeredSchemas.forEach((k) => {
          this.grpcSdk.bus!.publish('database', JSON.stringify(k));
        });
        return;
      }
      try {
        let receivedSchema = JSON.parse(message);
        if (receivedSchema.name) {
          let schema = new ConduitSchema(
            receivedSchema.name,
            receivedSchema.modelSchema,
            receivedSchema.modelOptions,
            receivedSchema.collectionName,
          );
          schema.ownerModule = receivedSchema.ownerModule;
          self._activeAdapter
            .createSchemaFromAdapter(schema)
            .then(() => {
            })
            .catch(() => {
              console.log('Failed to create/update schema');
            });
        }
      } catch (err) {
        console.error('Something was wrong with the message');
      }
    });
    const schemaController = new SchemaController(
      this.grpcSdk,
      this._activeAdapter,
      this.userRouter,
    );
    const customEndpointController = new CustomEndpointController(
      this.grpcSdk,
      this._activeAdapter,
      this.userRouter,
    );
    this.adminRouter = new AdminHandlers(
      this.grpcServer,
      this.grpcSdk,
      this._activeAdapter,
      schemaController,
      customEndpointController,
    );
  }

  publishSchema(schema: any) {
    const sendingSchema = JSON.stringify(schema);
    this.grpcSdk.bus!.publish('database', sendingSchema);
    console.log('Updated state');
  }

  async createSchemaFromAdapter(call: CreateSchemaRequest): Promise<any> {
    let schema = new ConduitSchema(
      call.schema!.name,
      JSON.parse(call.schema!.modelSchema),
      JSON.parse(call.schema!.modelOptions),
      call.schema!.collectionName,
    );
    if (schema.name.indexOf('-') >= 0 || schema.name.indexOf(' ') >= 0) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'Names cannot include spaces and - characters');
    }
    schema.ownerModule = (call as any).metadata.get('module-name')[0];
    await this._activeAdapter
      .createSchemaFromAdapter(schema)
      .then((schemaAdapter: SchemaAdapter<any>) => {
        const originalSchema = {
          name: schemaAdapter.originalSchema.name,
          modelSchema: JSON.stringify(schemaAdapter.originalSchema.modelSchema),
          modelOptions: JSON.stringify(schemaAdapter.originalSchema.schemaOptions),
          collectionName: schemaAdapter.originalSchema.collectionName,
        };
        this.publishSchema({
          name: call.schema!.name,
          modelSchema: JSON.parse(call.schema!.modelSchema),
          modelOptions: JSON.parse(call.schema!.modelOptions),
          collectionName: call.schema!.collectionName,
          owner: schema.ownerModule,
        });
        return {
          schema: originalSchema,
        };

      })
      .catch((err: any) => {
        throw new GrpcError(status.INTERNAL, err.message);
      });
  }

  /**
   * Given a schema name, returns the schema adapter assigned
   * @param call
   * @param callback
   */
  async getSchema(call: GetSchemaRequest): Promise<DeepPartial<GetSchemaResponse>> {
    try {
      const schemaAdapter = this._activeAdapter.getSchema(call.schemaName);
      return {
        schema: {
          name: schemaAdapter.name,
          modelSchema: JSON.stringify(schemaAdapter.modelSchema),
          modelOptions: JSON.stringify(schemaAdapter.schemaOptions),
          collectionName: schemaAdapter.collectionName,
        },
      };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async getSchemas(call: GetSchemasRequest): Promise<DeepPartial<GetSchemasResponse>> {
    try {
      const schemas = this._activeAdapter.getSchemas();
      return {
        schemas: schemas.map((schema) => {
          return {
            name: schema.name,
            modelSchema: JSON.stringify(schema.modelSchema),
            modelOptions: JSON.stringify(schema.schemaOptions),
            collectionName: schema.collectionName,
          };
        }),
      };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async deleteSchema(call: DropCollectionRequest): Promise<DeepPartial<DropCollectionResponse>> {
    try {
      const schemas = await this._activeAdapter.deleteSchema(
        call.schemaName,
        call.deleteData,
        (call as any).metadata.get('module-name')[0],
      );
      return { result: schemas };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  /**
   * Create, update or delete caller module's extension for target schema
   * @param call
   * @param callback
   */
  async setSchemaExtension(call: SetSchemaExtensionRequest): Promise<DeepPartial<any>> {
    try {
      const schemaName = call.extension!.name;
      const extOwner = (call as any).metadata.get('module-name')[0];
      const extModel = JSON.parse(call.extension!.modelSchema);
      const schema = await this._activeAdapter.getBaseSchema(schemaName);
      if (!schema) {
        throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
      }
      await this._activeAdapter
        .setSchemaExtension(schema, extOwner, extModel)
        .then((schemaAdapter: SchemaAdapter<any>) => {
          const originalSchema = {
            name: schemaAdapter.originalSchema.name,
            modelSchema: JSON.stringify(schemaAdapter.originalSchema.modelSchema),
            modelOptions: JSON.stringify(schemaAdapter.originalSchema.schemaOptions),
            collectionName: schemaAdapter.originalSchema.collectionName,
          };
          this.publishSchema({
            name: call.extension!.name,
            modelSchema: schemaAdapter.model,
            modelOptions: schemaAdapter.originalSchema.schemaOptions,
            collectionName: schemaAdapter.originalSchema.collectionName,
            owner: schemaAdapter.originalSchema.ownerModule,
          });
          return {
            schema: originalSchema,
          };

        })
        .catch((err: any) => {
          throw new GrpcError(status.INTERNAL, err.message);

        });
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async findOne(call: FindOneRequest): Promise<DeepPartial<QueryResponse>> {
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(call.schemaName);
      const doc = await schemaAdapter.model.findOne(
        call.query,
        call.select,
        call.populate,
        schemaAdapter.relations,
      );
      return { result: JSON.stringify(doc) };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async findMany(call: FindRequest): Promise<DeepPartial<QueryResponse>> {
    try {
      const skip = call.skip;
      const limit = call.limit;
      const select = call.select;
      const sort = call.sort ? JSON.parse(call.sort) : null;
      const populate = call.populate;

      const schemaAdapter = this._activeAdapter.getSchemaModel(call.schemaName);

      const docs = await schemaAdapter.model.findMany(
        call.query,
        skip,
        limit,
        select,
        sort,
        populate,
        schemaAdapter.relations,
      );
      return { result: JSON.stringify(docs) };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async create(call: QueryRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const schemaName = call.schemaName;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canCreate(moduleName, schemaAdapter.model))) {
        throw new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to create ${schemaName} entries!`);
      }

      const doc = await schemaAdapter.model.create(call.query);
      const docString = JSON.stringify(doc);

      this.grpcSdk.bus?.publish(`${this.name}:create:${schemaName}`, docString);

      return { result: docString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async createMany(call: QueryRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const schemaName = call.schemaName;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canCreate(moduleName, schemaAdapter.model))) {
        throw new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to create ${schemaName} entries!`);
      }

      const docs = await schemaAdapter.model.createMany(call.query);
      const docsString = JSON.stringify(docs);

      this.grpcSdk.bus?.publish(`${this.name}:createMany:${schemaName}`, docsString);
      return { result: docsString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async findByIdAndUpdate(call: UpdateRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const { schemaName } = call;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canModify(moduleName, schemaAdapter.model))) {
        throw new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to modify ${schemaName} entries!`);
      }

      const result = await schemaAdapter.model.findByIdAndUpdate(
        call.id,
        call.query,
        call.updateProvidedOnly,
        call.populate,
        schemaAdapter.relations,
      );
      const resultString = JSON.stringify(result);

      this.grpcSdk.bus?.publish(`${this.name}:update:${schemaName}`, resultString);

      return { result: resultString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);

    }
  }

  async updateMany(call: UpdateManyRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const schemaName = call.schemaName;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canModify(moduleName, schemaAdapter.model))) {
        throw new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to modify ${schemaName} entries!`);
      }

      const result = await schemaAdapter.model.updateMany(
        call.filterQuery,
        call.query,
        call.updateProvidedOnly,
      );
      const resultString = JSON.stringify(result);

      this.grpcSdk.bus?.publish(`${this.name}:updateMany:${schemaName}`, resultString);

      return { result: resultString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async deleteOne(call: QueryRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const { schemaName, query } = call;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canDelete(moduleName, schemaAdapter.model))) {
        throw new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to delete ${schemaName} entries!`);
      }

      const result = await schemaAdapter.model.deleteOne(query);
      const resultString = JSON.stringify(result);

      this.grpcSdk.bus?.publish(`${this.name}:delete:${schemaName}`, resultString);

      return { result: resultString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async deleteMany(call: QueryRequest): Promise<DeepPartial<QueryResponse>> {
    const moduleName = (call as any).metadata.get('module-name')[0];
    const { schemaName, query } = call;
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
      if (!(await canDelete(moduleName, schemaAdapter.model))) {
        throw  new GrpcError(status.PERMISSION_DENIED, `Module ${moduleName} is not authorized to delete ${schemaName} entries!`);
      }

      const result = await schemaAdapter.model.deleteMany(query);
      const resultString = JSON.stringify(result);

      this.grpcSdk.bus?.publish(`${this.name}:delete:${schemaName}`, resultString);

      return { result: resultString };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }

  async countDocuments(call: QueryRequest): Promise<DeepPartial<QueryResponse>> {
    try {
      const schemaAdapter = this._activeAdapter.getSchemaModel(call.schemaName);
      const result = await schemaAdapter.model.countDocuments(call.query);
      return { result: JSON.stringify(result) };
    } catch (err) {
      throw new GrpcError(status.INTERNAL, err.message);
    }
  }
}
