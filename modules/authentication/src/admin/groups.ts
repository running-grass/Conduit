import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { User, Role, Group, GroupMembership, RoleMembership } from '../models';
import escapeStringRegexp from 'escape-string-regexp';
import { GroupUtils } from '../utils/groupUtils';


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
      await Role.getInstance().create({ name: 'User', group: createdGroup.name });
    }
    return { createdGroup };
  }

  async addGroupMemberships(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const memberships = call.request.params.memberships;
    const retMemberships = [];
    for (let membership of memberships) {   //checks

      const userId = membership.user;
      const user = await User.getInstance().findOne({ _id: userId })
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      if (isNil(user)) {
        throw new GrpcError(status.NOT_FOUND, 'User not found');
      }

      const groupId = membership.group;
      const group = await Group.getInstance().findOne({ _id: groupId })
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      if (isNil(group)) {
        throw new GrpcError(status.NOT_FOUND, 'Group not found');
      }

      let roles: string [] = membership.roles;
      if (isNil(roles)) {
        roles = ['User'];
      }
      const userRoles = await Role.getInstance().findMany({ $and: [{ name: { $in: roles } }, { group: group.name }] });
      if (userRoles.length !== roles.length) {
        throw new GrpcError(status.ALREADY_EXISTS, `Some roles does not exist`);
      }

      let query = { $and: [{ user: userId }, { group: groupId }] };
      const count = await GroupMembership.getInstance().countDocuments(query);
      if (count > 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Membership already exists`);
      }
      const createdMembership = await GroupUtils.addGroupUser(membership.user, group, userRoles)
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });

      retMemberships.push(createdMembership);
    }

    return { retMemberships };
  }

  async getGroupMemberships(call: ParsedRouterRequest) {
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    const { groupId } = call.request.params;
    let { sort, populate } = call.request.params;
    if (!isNil(populate)) {
      populate = GroupUtils.populateArray(populate);
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

  async removeGroupMemberships(call: ParsedRouterRequest) {
    const { ids, groupId } = call.request.params;
    const group = await Group.getInstance().findOne({ _id: groupId }).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });
    if (isNil(group)) {
      throw new GrpcError(status.NOT_FOUND, 'Group not found');
    }
    let query = { $and: [{ group: groupId }, { user: { $in: ids } }] };
    const foundMemberships = await GroupMembership.getInstance().findMany(query)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (ids.length !== foundMemberships.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some users are not members of this group');
    }

    for (const membership of foundMemberships) {     // remove from RoleMembership table && from GroupMembership
      const roleIds = await Role.getInstance().findMany(
        { $and: [{ name: { $in: membership.roles } }, { group: group.name }] },
        '_id',
      ).catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

      await RoleMembership.getInstance().deleteMany({ $and: [{ _id: { $in: roleIds } }, { user: membership.user }] })
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
    }
    await GroupMembership.getInstance().deleteMany(query)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    return 'User were removed from the group';
  }

  async getGroups(call: ParsedRouterRequest) {
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    let { sort, search } = call.request.params;

    let query: any = {};
    if (!isNil(search)) {
      const name = escapeStringRegexp(search);
      query['name'] = { $regex: `.*${name}.*`, $options: 'i' };
    }

    const groups = await Group.getInstance().findMany(query, undefined, skip, limit, sort);
    const count = groups.length;
    return { groups, count };
  }

  async removeMembership() {

  }
}
