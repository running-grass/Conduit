import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { User, Role, Group, GroupMembership } from '../models';


export class GroupManager {

  constructor(private readonly grpcSdk: ConduitGrpcSdk) {
  }

  async createGroup(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const groupName = call.request.params.name;
    const group = await Group.getInstance().findOne({ name: groupName })
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(group)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Group ${groupName} already exists`);
    }
    const createdGroup = await Group.getInstance().create({
      name: groupName,
    });
    return { createdGroup };
  }

  async addGroupMembers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const memberships = call.request.params.memberships;
    for (let membership of memberships) {

      const userId = membership.userId;
      const user = await User.getInstance().findOne({ _id: userId })
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      if (isNil(user)) {
        throw new GrpcError(status.NOT_FOUND, 'User not found');
      }

      const groupId = membership.groupId;
      const group = await Group.getInstance().findOne({ _id: groupId })
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      if (isNil(group)) {
        throw new GrpcError(status.NOT_FOUND, 'Group not found');
      }

      const roles = membership.roles;
      const foundRoles = await Role.getInstance().countDocuments({ name: { $in: roles } });
      if (foundRoles === 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Some roles does not exist`);
      }

      const query = { $and: [{ userId: userId }, { groupId: groupId }, { roles: { $in: roles } }] };
      const count = await GroupMembership.getInstance().countDocuments(query);
      if (count > 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Membership already exists`);
      }
    }
    const createdMemberships = await GroupMembership.getInstance().createMany(memberships);
    return { createdMemberships };
  }


}
