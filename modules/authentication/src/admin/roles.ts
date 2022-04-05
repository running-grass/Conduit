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

  constructor(private readonly grpcSdk: ConduitGrpcSdk) { //create a
  }

  async createRole(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const roleName = call.request.params.name;
    const groupId = call.request.params.groupId ?? null;
    if (!groupId) {
      const query = { $and: [{ groupId: null }, { name: roleName }] };
      const nonGroupRoleDocuments = await Role.getInstance().countDocuments(query);
      if (nonGroupRoleDocuments > 0) {
        throw new GrpcError(status.ABORTED, `Role already exists`);
      }
      return await Role.getInstance().create({ name: roleName, groupId: null });
    }
    const group = await Group.getInstance().findOne({ _id: groupId });
    if (isNil(group)) {
      throw new GrpcError(status.ABORTED, `You must create a group before you create a role`);
    }
    const query = { $and: [{ name: roleName }, { groupId: groupId }] };
    const role = await Role.getInstance().findOne(query)
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(role)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Role ${roleName} already exists`);
    }
    const createdRole = await Role.getInstance().create({
      name: roleName,
      groupId: groupId,
    });

    return { createdRole };
  }


}
