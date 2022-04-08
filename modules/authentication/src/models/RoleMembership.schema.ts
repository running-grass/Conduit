import {
  ConduitActiveSchema,
  DatabaseProvider,
  TYPE,
} from '@conduitplatform/grpc-sdk';
import { User } from './User.schema';
import { Role } from './Role.schema';

const schema = {
  _id: TYPE.ObjectId,
  user: {
    type: TYPE.Relation,
    model: 'User',
    required: true,
  },
  role: {
    type: TYPE.Relation,
    model: 'Role',
    required: true,
  },
  permissions: { type: TYPE.JSON },
};
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

export class RoleMembership extends ConduitActiveSchema<RoleMembership> {
  private static _instance: RoleMembership;
  _id: string;
  userId: string | User;
  role: string | Role;
  permissions: any;


  private constructor(database: DatabaseProvider) {
    super(database, RoleMembership.name, schema, schemaOptions, collectionName);
  }

  static getInstance(database?: DatabaseProvider) {
    if (RoleMembership._instance) return RoleMembership._instance;
    if (!database) {
      throw new Error('No database instance provided!');
    }
    RoleMembership._instance = new RoleMembership(database);
    return RoleMembership._instance;
  }
}
