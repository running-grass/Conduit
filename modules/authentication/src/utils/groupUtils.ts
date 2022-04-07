import { GroupMembership, Role, User } from '../models';
import { isNil } from 'lodash';
import { RoleMembership } from '../models/RoleMembership.schema';
import { status } from '@grpc/grpc-js';
import { GrpcError } from '@conduitplatform/grpc-sdk';

export namespace GroupUtils {

  export async function addGroupUser(userId: string, groupId: string) {
    const membership = {
      user: userId,
      roles: ['User'],
      group: groupId,
    };
    const groupMembership = await GroupMembership.getInstance().create(membership)
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    const role = await Role.getInstance().findOne({
      name: 'User',
      group: groupId,
    }).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });
    await RoleMembership.getInstance().create({
      user: userId,
      roles: [role!._id],
    });
    return groupMembership;
  }

  export async function isGroupMember(userId: string, groupId: string) {
    let query = { $and: [{ user: userId }, { group: groupId }] };
    const member = await GroupMembership.getInstance().findOne(query);

    if (isNil(member)) return false;
    return true;
  }

  export async function canInvite(userId: string, groupId: string) {
    const membership = await GroupMembership.getInstance().findOne({ user: userId, group: groupId },
      'roles',
      'roles',
    );
    if (!isNil(membership)) {
      for (const role of membership!.roles) {
        const actualRole = await Role.getInstance().findOne({ name: role })
          .catch((e: any) => {
            throw new Error(e.message);
          });
        if (actualRole!.permissions.group.canInvite || actualRole!.permissions.user.canInvite)
          return true;
      }
      return false;
    }
  }

  export async function createDefaultRoleMembership(user: User, group: string = '') {
    const query = { $and: [{ name: 'User' }, { group: group }] };
    const role: any = await Role.getInstance().findOne(query);
    await RoleMembership.getInstance().create({ user: user._id, roles: [role._id] });
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
}

