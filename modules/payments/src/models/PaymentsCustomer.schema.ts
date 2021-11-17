import {
  ConduitActiveSchema,
  DatabaseProvider,
  TYPE,
} from '@quintessential-sft/conduit-grpc-sdk';
import { User } from './User.model';

const schema = {
  _id: TYPE.ObjectId,
  userId: {
    type: TYPE.Relation,
    model: 'User',
  },
  email: {
    type: TYPE.String,
    required: true,
  },
  phoneNumber: {
    type: TYPE.String,
    required: true
  },
  buyerName: TYPE.String,
  address: TYPE.String,
  postCode: TYPE.String,
  stripe: {
    customerId: TYPE.String,
  },
  createdAt: TYPE.Date,
  updatedAt: TYPE.Date,
};
const schemaOptions = {
  timestamps: true,
  systemRequired: true,
};
const collectionName = undefined;

export class PaymentsCustomer extends ConduitActiveSchema<PaymentsCustomer> {
  private static _instance: PaymentsCustomer;
  _id!: string;
  userId!: string | User;
  email!: string;
  phoneNumber!: string;
  buyerName!: string;
  address!: string;
  postCode!: string;
  stripe!: {
    customerId: string;
  };
  createdAt!: Date;
  updatedAt!: Date;

  private constructor(database: DatabaseProvider) {
    super(database, PaymentsCustomer.name, schema, schemaOptions, collectionName);
  }

  static getInstance(database?: DatabaseProvider) {
    if (PaymentsCustomer._instance) return PaymentsCustomer._instance;
    if (!database) {
      throw new Error('No database instance provided!');
    }
    PaymentsCustomer._instance = new PaymentsCustomer(database);
    return PaymentsCustomer._instance;
  }
}