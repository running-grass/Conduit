import { GroupMembership, Group, Role, User } from '../models';
import { isNil } from 'lodash';
import { GrpcError } from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';

export namespace GroupUtils {

  export async function addGroupUser(userId: string, group: Group, groupRoles: string[]) {

    const membership = {
      user: userId,
      roles: groupRoles,
      group: group._id,
    };
    const groupMembership = await GroupMembership.getInstance().create(membership)
      .catch((e: any) => {
        throw new Error(e.message);
      });
    return groupMembership;
  }

  export async function isGroupMember(userId: string, groupId: string) {
    let query = { $and: [{ user: userId }, { group: groupId }] };
    const member = await GroupMembership.getInstance().findOne(query);

    if (isNil(member)) return false;
    return true;
  }

  // TODO Think if this function CREATE an invite or does a simple add in the group
  export async function canInvite(userId: string, group: Group): Promise<boolean> {
    const membership = await GroupMembership.getInstance().findOne({ user: userId, group: group._id },
      'roles',
      'roles',
    );
    if (!isNil(membership)) {
      for (const roleName of membership!.roles) {
        const role = await Role.getInstance().findOne({ name: roleName, group: group.name })
          .catch((e: any) => {
            throw new Error(e.message);
          });
        if (role!.permissions.group.canInvite || role!.permissions.user.canInvite)
          return true;
      }
    }
    return false;
  }

  export async function createDefaultRole(user: User, group: string = '') {
    const query = { $and: [{ name: 'User' }, { group: group }] };
    let foundGroup;
    let role: any = await Role.getInstance().findOne(query);
    if (isNil(role)) {
      role = await Role.getInstance().create({
        name: 'User',
        group: '',
      }).catch((e: any) => {
        throw new Error(e.message);
      });
    }

    foundGroup = await Group.getInstance().findOne({ name: group })
      .catch((e: Error) => {
        throw  new GrpcError(status.INTERNAL, e.message);
      });
    let groupId = null;
    if (!isNil(foundGroup)) {
      groupId = foundGroup._id;
    }
    await GroupMembership.getInstance().create({
      user: user._id,
      group: groupId,
      roles: [role._id],
    })
      .catch((e: Error) => {
        throw  new GrpcError(status.INTERNAL, e.message);
      });
    return;
  }

  export function populateArray(pop: any) {
    if (!pop) return pop;
    if (pop.indexOf(',') !== -1) {
      pop = pop.split(',');
    } else if (Array.isArray(pop)) {
      return pop;
    } else {
      pop = [pop];
    }
    return pop;
  }

  export async function listGroupUsers(skip: number, limit: number, sort: any, groupId: string) {
    const users = await GroupMembership.getInstance().findMany(
      { group: groupId },
      'user',
      skip,
      limit,
      sort,
      'user',
    );
    return users;
  }

  export async function removeUsersFromGroup(ids: string[], groupId: Group) {
    await GroupMembership.getInstance().deleteMany({
      $and: [{ user: { $in: ids } }, { group: groupId }],
    })
      .catch((e:Error) => {
        throw new Error(e.message);
      });
  }

}


