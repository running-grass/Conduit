import { ConduitActiveSchema, DatabaseProvider, TYPE } from '@conduitplatform/grpc-sdk';

const schema = {
  _id: TYPE.ObjectId,
  name: {
    type: TYPE.String,
    required: true,
  },
  group: {
    type: TYPE.String,
  },
  permissions: {
    user: {
      canDelete: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
      canReset: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
      canInvite: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
      viewUsers: {
        type: TYPE.Boolean,
        default: true,
        required: true,
      },
      manageUsers: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
    },
    group: {
      canModifyRole: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
      canDelete: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
      viewGroups: {
        type: TYPE.Boolean,
        default: false,
        required: true,
      },
    },
  },
  createdAt: TYPE.Date,
  updatedAt: TYPE.Date,
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

export class Role extends ConduitActiveSchema<Role> {
  private static _instance: Role;
  _id: string;
  name: string;
  group: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: {
    user: {
      canDelete: boolean;
      canReset: boolean;
      canInvite: boolean;
      viewUsers: boolean;
      manageUser: boolean;
    },
    group: {
      canInvite: boolean
      canDelete: boolean;
      viewGroups: boolean;
      canModifyRole: boolean;

    }
  };
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
