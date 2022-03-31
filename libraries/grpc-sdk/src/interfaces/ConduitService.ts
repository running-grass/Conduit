import { GrpcRequest, GrpcResponse } from '..';
import { ServiceImplementation } from 'nice-grpc';

export interface ConduitService {
  readonly protoPath: string;
  readonly protoDescription: string;
  functions: { [p: string]: (call: any) => any | Promise<any> } | ServiceImplementation<any>;
}
