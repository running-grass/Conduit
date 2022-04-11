import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { User, Role, Group, GroupMembership } from '../models';
import escapeStringRegexp from 'escape-string-regexp';
import { GroupUtils } from '../utils/groupUtils';


export class GroupManager {

  constructor(private readonly grpcSdk: ConduitGrpcSdk) {
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

  async createGroup(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { groupName, parentGroup } = call.request.params;

    const parent = await Group.getInstance().findOne({ _id: parentGroup })
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (isNil(parent)) {
      throw new GrpcError(status.NOT_FOUND, `Group ${parent!.name} not exist`);
    }

    const group = await Group.getInstance().findOne({ name: groupName })
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(group)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Group ${groupName} already exists`);
    }

    const createdGroup = await Group.getInstance().create({
      name: groupName,
      parentGroup: parentGroup
    });

    const role = await Role.getInstance().findOne({ $and: [{ name: 'User' }, { group: createdGroup._id }] });  //default User role
    if (isNil(role)) {
      await Role.getInstance().create({ name: 'User', group: createdGroup.name });
    }
    return { createdGroup };
  }

  async deleteGroups(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { ids } = call.request.params;
    let query = { _id: { $in: ids } };
    const groups = await Group.getInstance().findMany(query)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (groups.length != ids.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some groups were not found');
    }
    await Group.getInstance().deleteMany(query)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    const groupNames = groups.map((group) => {
      return group.name;
    });

    await GroupMembership.getInstance().deleteMany({ group: { $in: ids } })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    await Role.getInstance().deleteMany({ group: { $in: groupNames } })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    return 'Groups were deleted';
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

      let roleNames: string [] = membership.roles;
      let roleIds;
      if (isNil(roleNames)) {
        const defaultGroupRole = await Role.getInstance().findOne({ name: 'User', group: group.name });
        roleIds = [defaultGroupRole!._id];
      }
      let userRoles = await Role.getInstance().findMany({ $and: [{ name: { $in: roleNames } }, { group: group.name }] });
      if (userRoles.length !== roleNames.length) {
        throw new GrpcError(status.ALREADY_EXISTS, `Some roles does not exist`);
      }

      let query = { $and: [{ user: userId }, { group: groupId }] };
      const count = await GroupMembership.getInstance().countDocuments(query);
      if (count > 0) {
        throw new GrpcError(status.ALREADY_EXISTS, `Membership already exists`);
      }
      roleIds = userRoles.map((role) => {
        return role._id;
      });
      const createdMembership = await GroupUtils.addGroupUser(membership.user, group, roleIds)
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
    const users = await GroupUtils.listGroupUsers(skip, limit, sort, groupId)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    const count = users.length;
    return { users, count };
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
    await GroupMembership.getInstance().deleteMany(query)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    return 'Users were removed from the group';
  }

}
