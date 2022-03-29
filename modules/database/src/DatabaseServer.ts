import DatabaseModule from "./Database";
import {DatabaseProvider} from './proto-types/src/database';
import {
    CreateSchemaRequest,
    DropCollectionRequest,
    DropCollectionResponse,
    FindOneRequest,
    FindRequest,
    GetSchemaRequest,
    GetSchemasRequest,
    QueryRequest,
    QueryResponse,
    UpdateManyRequest,
    UpdateRequest,
    CreateSchemaResponse,
    GetSchemasResponse,
    GetSchemaResponse
} from "./proto-types/src/database";
import {ConduitSchema, GrpcError} from "@conduitplatform/grpc-sdk";
import {status} from "@grpc/grpc-js";
import {SchemaAdapter} from "./interfaces";
import {canCreate, canDelete, canModify} from "./permissions";
import {
    SetSchemaExtensionRequest,
    SetSchemaExtensionResponse
} from "@conduitplatform/grpc-sdk/dist/protoUtils/database";

export class DatabaseServer extends DatabaseModule implements DatabaseProvider {
    // gRPC Service
    /**
     * Should accept a JSON schema and output a .ts interface for the adapter
     * @param call
     * @param callback
     */
    constructor(dbType: string, dbUri: string) {
        super(dbType, dbUri);

    }

    async CreateSchemaFromAdapter(call: CreateSchemaRequest): Promise<CreateSchemaResponse | any> {
        let schema = new ConduitSchema(
            call.schema!.name,
            JSON.parse(call.schema!.modelSchema),
            JSON.parse(call.schema!.modelOptions),
            call.schema!.collectionName,
        );
        if (schema.name.indexOf('-') >= 0 || schema.name.indexOf(' ') >= 0) {
            return {
                code: status.INVALID_ARGUMENT,
                message: 'Names cannot include spaces and - characters',
            }
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
                return {
                    code: status.INTERNAL,
                    message: err.message,
                }
            });
    }

    /**
     * Given a schema name, returns the schema adapter assigned
     * @param call
     * @param callback
     */
    async GetSchema(call: GetSchemaRequest): Promise<GetSchemaResponse | any> {
        try {
            const schemaAdapter = this._activeAdapter.getSchema(call.schemaName);
            const retSchema: GetSchemaResponse = {
                schema: {
                    name: schemaAdapter.name,
                    modelSchema: JSON.stringify(schemaAdapter.modelSchema),
                    modelOptions: JSON.stringify(schemaAdapter.schemaOptions),
                    collectionName: schemaAdapter.collectionName,
                }
            }
            return retSchema;

        } catch (err: any) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    async GetSchemas(call: GetSchemasRequest): Promise<GetSchemasResponse | any> {
        try {
            const schemas = this._activeAdapter.getSchemas();
            const retSchemas = schemas.map((schema) => {
                return {
                    name: schema.name,
                    modelSchema: JSON.stringify(schema.modelSchema),
                    modelOptions: JSON.stringify(schema.schemaOptions),
                    collectionName: schema.collectionName,
                };
            })
            return retSchemas
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    async DeleteSchema(call: DropCollectionRequest): Promise<DropCollectionResponse | any> {
        try {
            const schemas = await this._activeAdapter.deleteSchema(
                call.schemaName,
                call.deleteData,
                (call as any).metadata.get('module-name')[0],
            );
            return {
                result: schemas
            };
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    /**
     * Create, update or delete caller module's extension for target schema
     * @param call
     * @param callback
     */
    async SetSchemaExtension(call: SetSchemaExtensionRequest): Promise<SetSchemaExtensionResponse | any> {
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
                        schema: originalSchema
                    };
                })
                .catch((err: any) => {
                    return {
                        code: status.INTERNAL,
                        message: err.message,
                    }
                });
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

    async FindOne(call: FindOneRequest): Promise<QueryResponse | any> {
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(call.schemaName);
            const doc = await schemaAdapter.model.findOne(
                call.query,
                call.select,
                call.populate,
                schemaAdapter.relations,
            );
            return {result: JSON.stringify(doc)}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    async FindMany(call: FindRequest): Promise<QueryResponse | any> {
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
            return {result: JSON.stringify(docs)};
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    async Create(call: QueryRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const schemaName = call.schemaName;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canCreate(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to create ${schemaName} entries!`,
                };
            }

            const doc = await schemaAdapter.model.create(call.query);
            const docString = JSON.stringify(doc);

            this.grpcSdk.bus?.publish(`${this.name}:create:${schemaName}`, docString);

            return {result: docString};
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message
            }
        }
    }

    async CreateMany(call: QueryRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const schemaName = call.schemaName;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canCreate(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to create ${schemaName} entries!`,
                };
            }

            const docs = await schemaAdapter.model.createMany(call.query);
            const docsString = JSON.stringify(docs);

            this.grpcSdk.bus?.publish(`${this.name}:createMany:${schemaName}`, docsString);

            return {result: docsString}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

    async FindByIdAndUpdate(call: UpdateRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const {schemaName} = call;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canModify(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to modify ${schemaName} entries!`,
                }
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

            return {result: resultString}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

    async UpdateMany(call: UpdateManyRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const {schemaName} = call;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canModify(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to modify ${schemaName} entries!`,
                };
            }

            const result = await schemaAdapter.model.updateMany(
                call.filterQuery,
                call.query,
                call.updateProvidedOnly,
            );
            const resultString = JSON.stringify(result);

            this.grpcSdk.bus?.publish(`${this.name}:updateMany:${schemaName}`, resultString);

            return {result: resultString};
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

    async DeleteOne(call: QueryRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const {schemaName, query} = call;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canDelete(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to delete ${schemaName} entries!`,
                }
            }

            const result = await schemaAdapter.model.deleteOne(query);
            const resultString = JSON.stringify(result);

            this.grpcSdk.bus?.publish(`${this.name}:delete:${schemaName}`, resultString);

            return {result: resultString}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

    async DeleteMany(call: QueryRequest): Promise<QueryResponse | any> {
        const moduleName = (call as any).metadata.get('module-name')[0];
        const {schemaName, query} = call;
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(schemaName);
            if (!(await canDelete(moduleName, schemaAdapter.model))) {
                return {
                    code: status.PERMISSION_DENIED,
                    message: `Module ${moduleName} is not authorized to delete ${schemaName} entries!`,
                };
            }

            const result = await schemaAdapter.model.deleteMany(query);
            const resultString = JSON.stringify(result);

            this.grpcSdk.bus?.publish(`${this.name}:delete:${schemaName}`, resultString);

            return {result: resultString}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            };
        }
    }

    async CountDocuments(call: QueryRequest): Promise<QueryResponse | any> {
        try {
            const schemaAdapter = this._activeAdapter.getSchemaModel(call.schemaName);
            const result = await schemaAdapter.model.countDocuments(call.query);
            return {result: JSON.stringify(result)}
        } catch (err) {
            return {
                code: status.INTERNAL,
                message: err.message,
            }
        }
    }

}