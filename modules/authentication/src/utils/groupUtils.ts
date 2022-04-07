import { GroupMembership, RoleMembership, Group, Role, User } from '../models';
import { isNil } from 'lodash';

export namespace GroupUtils {

  export async function addGroupUser(userId: string, group: Group) {
    const membership = {
      user: userId,
      roles: ['User'],
      group: group._id,
    };
    const groupMembership = await GroupMembership.getInstance().create(membership)
      .catch((e: any) => {
        throw new Error(e.message);
      });

    const role = await Role.getInstance().findOne({
      name: 'User',
      group: group.name,
    }).catch((e: Error) => {
      throw new Error(e.message);
    });

    await RoleMembership.getInstance().create({
      user: userId,
      roles: [role!._id],
    }).catch((e: any) => {
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

