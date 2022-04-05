import { GroupMembership, Role } from '../models';
import { isNil } from 'lodash';
import { RoleMembership } from '../models/RoleMembership.schema';

export namespace GroupUtils {

  export async function addGroupUser(userId: string, groupId: string, roles?: string[]) {
    const membership = {
      userId: userId,
      role: roles ?? [],
      groupId: groupId,
    };
    const groupMembership = await GroupMembership.getInstance().create(membership);
    return groupMembership;
  }

  export async function isGroupMember(userId: string, groupId: string) {
    let query = { $and: [{ userId: userId }, { groupId: groupId }] };
    const member = await GroupMembership.getInstance().findOne(query);

    if (isNil(member)) return false;
    return true;
  }

  /*
    -If invitor belongs to the group and have invitePermissions then he can invite
    -Else, if it doesn't check if it has a 'general' role in the RoleMembershipSchema
  */

  export async function checkPermissions(userId: string, groupId: string, permission: string): Promise<boolean> {
    let canOperate = true;
    if (!isGroupMember(userId, groupId)) {
      const roleMemberships: any = await RoleMembership.getInstance().findOne({ userId: userId });
      if (isNil(roleMemberships)) {  //
        throw new Error('You do not have the appropriate role to invite');
      }
      for (let membership of roleMemberships) {
        for (let roleId of membership.roles) {
          const actualRole: any = await Role.getInstance().findOne({ _id: roleId });
          if (actualRole.permissions[permission]) {
            canOperate = true;
          }
        }
      }
    }
    return canOperate;
  }


}
