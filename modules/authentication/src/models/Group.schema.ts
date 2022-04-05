import { ConduitActiveSchema, DatabaseProvider, TYPE } from '@conduitplatform/grpc-sdk';

const schema = {
  _id: TYPE.ObjectId,
  name: {
    type: TYPE.String,
    required: true
  },
  parentGroup: {
    type: TYPE.Relation,
    model: 'Group',
  },
  createdAt: TYPE.Date,
  updatedAt: TYPE.Date,
}
const schemaOptions = {
  timestamps: true,
  conduit: {
    permissions: {
      extendable: true,
      canCreate: false,
      canModify: 'ExtensionOnly',
      canDelete: false,
    },
  },
} as const;

const collectionName = undefined;

export class Group extends ConduitActiveSchema<Group> {
  private static _instance: Group;
  _id: string;
  name: string;
  parentGroup: string | Group
  createdAt: Date;
  updatedAt: Date;

  constructor(database: DatabaseProvider) {
    super(database, Group.name, schema, schemaOptions, collectionName);
  }

  static getInstance(database?: DatabaseProvider) {
    if (Group._instance) return Group._instance;
    if (!database) {
      throw new Error('No database instance provided!');
    }
    Group._instance = new Group(database);
    return Group._instance;
  }
}