import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { Role, User } from '../models';
import { Group } from '../models/Group.schema';

export class RoleManager {

  constructor(private readonly grpcSdk: ConduitGrpcSdk) {
  }

  async createRole(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const roleName = call.request.params.name;

    const groups = await Group.getInstance().countDocuments({});
    if (groups === 0) {
      throw new GrpcError(status.ABORTED, `You must create a group before you create a role`);
    }
    const role = await Role.getInstance().findOne({ name: roleName })
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(role)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Role ${roleName} already exists`);
    }
    const createdRole = await Role.getInstance().create({
      name: roleName,
    });

    return { createdRole };
  }


}
