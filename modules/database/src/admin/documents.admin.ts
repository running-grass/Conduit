import ConduitGrpcSdk, {
  GrpcError,
  ParsedRouterRequest,
  UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { populateArray, wrongFields } from '../utils/utilities';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { MongooseSchema } from '../adapters/mongoose-adapter/MongooseSchema';
import { SequelizeSchema } from '../adapters/sequelize-adapter/SequelizeSchema';
import { Doc } from '../interfaces';

export class DocumentsAdmin {
  constructor(
    private readonly grpcSdk: ConduitGrpcSdk,
    private readonly database: DatabaseAdapter<MongooseSchema | SequelizeSchema>,
  ) {}

  async getDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id, populate } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    let populates;
    if (!isNil(populate)) {
      populates = populateArray(populate);
    }
    const document: Doc = await this.database
      .getSchemaModel(schemaName)
      .model.findOne({ _id: id }, undefined, populates);
    if (isNil(document)) {
      throw new GrpcError(status.NOT_FOUND, 'Document does not exist');
    }
    return document;
  }

  async getDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let { schemaName, query } = call.request.params;
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    if (!query || query.length === '') {
      query = {};
    }

    const documentsPromise = this.database
      .getSchemaModel(schemaName)
      .model.findMany(query, skip, limit);
    const countPromise = this.database
      .getSchemaModel(schemaName)
      .model.countDocuments(query);

    const [documents, count] = await Promise.all([documentsPromise, countPromise]);

    return { documents, count };
  }

  async createDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, inputDocument } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    return await this.database.getSchemaModel(schemaName).model.create(inputDocument);
  }

  async createDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, inputDocuments } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    const newDocuments = await this.database
      .getSchemaModel(schemaName)
      .model.createMany(inputDocuments);
    return { docs: newDocuments };
  }

  async updateDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id, changedDocument } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    const currentFields = Object.keys(schema.fields);
    const changedFields = Object.keys(changedDocument);
    if (!wrongFields(currentFields, changedFields)) {
      throw new GrpcError(status.NOT_FOUND, 'Wrong input fields!');
    }
    const dbDocument: Doc = await this.database
      .getSchemaModel(schemaName)
      .model.findOne({ _id: id });

    Object.assign(dbDocument, changedDocument);
    return await this.database
      .getSchemaModel(schemaName)
      .model.findByIdAndUpdate(dbDocument._id, dbDocument);
  }

  async updateDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, changedDocuments } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    let updatedDocuments: any[] = [];
    for (const doc of changedDocuments) {
      const dbDocument: Doc = await this.database
        .getSchemaModel(schemaName)
        .model.findOne({ _id: doc._id });
      Object.assign(dbDocument, doc);
      const updatedDocument = await this.database
        .getSchemaModel(schemaName)
        .model.findByIdAndUpdate(dbDocument._id, dbDocument);
      updatedDocuments.push(updatedDocument);
    }
    return { docs: updatedDocuments };
  }

  async deleteDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id } = call.request.params;
    const schema = await this.database
      .getSchemaModel('_DeclaredSchema')
      .model.findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    await await this.database.getSchemaModel(schemaName).model.deleteOne({ _id: id });
    return 'Ok';
  }
}
