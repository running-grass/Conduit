import { ConduitActiveSchema, DatabaseProvider, TYPE } from '@conduitplatform/grpc-sdk';

const schema = {
  _id: TYPE.ObjectId,
  name: {
    type: TYPE.String,
    required: true
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

export class Role extends ConduitActiveSchema<Role> {
  private static _instance: Role;
  _id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(database: DatabaseProvider) {
    super(database, Role.name, schema, schemaOptions, collectionName);
  }

  static getInstance(database?: DatabaseProvider) {
    if (Role._instance) return Role._instance;
    if (!database) {
      throw new Error('No database instance provided!');
    }
    Role._instance = new Role(database);
    return Role._instance;
  }
}
