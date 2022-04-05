import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { User, Role, Group, GroupMembership } from '../models';
import { populateArray } from '@conduit/chat/dist/utils';


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

    const role = await Role.getInstance().findOne({ $and: [{ name: 'User' }, { group: createdGroup._id }] });  //default User role
    if (isNil(role)) {
      await Role.getInstance().create({ name: 'User', group: createdGroup._id });
    }

    return { createdGroup };
  }

  async addGroupMembers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const memberships = call.request.params.memberships;
    for (let membership of memberships) {   //checks

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

      let roles = membership.roles;
      if (isNil(roles)) {
        roles = ['User'];
      }
      const foundRoles = await Role.getInstance().countDocuments({ name: { $in: roles } });
      if (foundRoles === 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Some roles does not exist`);
      }

      const query = { $and: [{ user: userId }, { group: groupId }, { roles: { $in: roles } }] };
      const count = await GroupMembership.getInstance().countDocuments(query);
      if (count > 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Membership already exists`);
      }
    }
    const createdMemberships = await GroupMembership.getInstance().createMany(memberships);
    return { createdMemberships };
  }

  async getGroupMemberships(call: ParsedRouterRequest) {
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    const { groupId } = call.request.params;
    let { sort, populate } = call.request.params;
    if (!isNil(populate)) {
      populate = populateArray(populate);
    }
    const group = await Group.getInstance().findOne({ _id: groupId });
    if (isNil(group)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Group does not exist`);
    }
    const groupMemberships = await GroupMembership.getInstance().findMany(
      { group: groupId },
      undefined,
      skip,
      limit,
      sort,
      populate,
    );
    if (isNil(groupMemberships)) {
      throw new GrpcError(status.NOT_FOUND, `Group ${group.name} does not have members`);
    }
    return { memberships: groupMemberships, count: groupMemberships.length };
  }
}