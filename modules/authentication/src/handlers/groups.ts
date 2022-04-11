import ConduitGrpcSdk, {
  ConduitNumber,
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  ConduitString,
  ConfigController,
  GrpcError,
  ParsedRouterRequest,
  RoutingManager,
  TYPE,
  UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { Group, GroupMembership, Role, User } from '../models';
import { isNil } from 'lodash';
import { status } from '@grpc/grpc-js';
import { GroupUtils } from '../utils/groupUtils';
import deleteGroup = GroupUtils.deleteGroup;

export class GroupHandlers {

  constructor(private readonly grpcSdk: ConduitGrpcSdk, private readonly routingManager: RoutingManager) {

  }

  async validate(): Promise<Boolean> {
    const config = ConfigController.getInstance().config;
    if (config.groups.enabled) {
      console.log(`Groups and Roles are active`);
      const role = await Role.getInstance().findOne({ name: 'User', group: '' });
      if (isNil(role))
        await Role.getInstance().create({ name: 'User', group: '' });
      return true;
    } else {
      console.log('Groups and Roles not active');
      return false;
    }
  }

  declareRoutes() {
    this.routingManager.route(
      {
        path: '/group/invite',
        action: ConduitRouteActions.POST,
        description: `Invites a user to a group`,
        middlewares: ['authMiddleware'],
        bodyParams: {
          groupId: ConduitString.Required,
          ids: [ConduitString.Required],
          roles: [ConduitString.Required],
        },
      },
      new ConduitRouteReturnDefinition('InviteResponse', 'String'),
      this.inviteUser.bind(this),
    );
    this.routingManager.route(
      {
        path: '/group/users',
        action: ConduitRouteActions.GET,
        description: `A client lists all the members of the groups that he belongs to if he has the permission to do this.`,
        queryParams: {
          groupId: ConduitString.Optional,
          skip: ConduitNumber.Optional,
          limit: ConduitNumber.Optional,
          sort: ConduitString.Optional,
          //search: ConduitString.Optional,
        },
        middlewares: ['authMiddleware'],
      },
      new ConduitRouteReturnDefinition('GetGroupUsers', {
        users: [User.getInstance().fields],
        count: ConduitNumber.Required,
      }),
      this.getGroupUsers.bind(this),
    );
    this.routingManager.route(
      {
        path: '/group/users',
        action: ConduitRouteActions.DELETE,
        description: `A client delete users from a specific group`,
        bodyParams: {
          groupId: ConduitString.Optional,
          ids: [ConduitString.Required],
        },
        middlewares: ['authMiddleware'],
      },
      new ConduitRouteReturnDefinition('RemoveUsersFromGroup', 'String'),
      this.removeUsersFromGroup.bind(this),
    );
    this.routingManager.route(
      {
        path: '/group',
        action: ConduitRouteActions.POST,
        description: `Client creates a group`,
        middlewares: ['authMiddleware'],
        bodyParams: {
          name: ConduitString.Required,
        },
      },
      new ConduitRouteReturnDefinition('GroupResponse', Group.getInstance().fields),
      this.createGroup.bind(this),
    );
    this.routingManager.route(
      {
        path: '/group/:id',
        action: ConduitRouteActions.DELETE,
        urlParams: {
          id: ConduitString.Required,
        },
        description: `Client deletes a group`,
        middlewares: ['authMiddleware'],
      },
      new ConduitRouteReturnDefinition('GroupResponse', 'String'),
      this.deleteGroup.bind(this),
    );
  }

  async getGroupUsers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { user } = call.request.context;
    const { groupId, sort } = call.request.params;
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;

    if (!isNil(groupId)) {
      const group = await Group.getInstance().findOne({ _id: groupId });
      if (isNil(group)) {
        throw new GrpcError(status.INTERNAL, 'Group not exists');
      }
      const viewerMembership = await GroupMembership.getInstance()
        .findOne(
          { group: groupId, user: user._id },
          undefined,
          'roles',
        );
      if (isNil(viewerMembership)) {
        throw new GrpcError(status.PERMISSION_DENIED, 'Permission Denied');
      }
      let canViewUsers = viewerMembership?.permissions?.user?.viewUsers;
      if (canViewUsers) {
        const users = await GroupUtils.listGroupUsers(skip, limit, sort, groupId);
        const count = users.length;
        return { users, count };
      } else if (!isNil(canViewUsers) && !canViewUsers) {
        throw new GrpcError(status.PERMISSION_DENIED, 'Permission Denied');
      } else {
        for (const role of viewerMembership!.roles as Role[]) {
          canViewUsers = role.permissions.user.viewUsers;
          if (canViewUsers) {
            canViewUsers = true;
            break;
          }
        }
        if (!canViewUsers) {
          throw new GrpcError(status.PERMISSION_DENIED, 'Permission Denied');
        }
        const users = await GroupUtils.listGroupUsers(skip, limit, sort, groupId);
        const count = users.length;
        return { users, count };
      }
    }
    return 5 as any;
    // TODO can a member of a parent group see the members of the subgroup?
  }

  // TODO Check if owner of the group can be deleted
  async removeUsersFromGroup(call: ParsedRouterRequest) {
    const { groupId, ids } = call.request.params;
    const whoRemoves = call.request.context.user;
    const group = await Group.getInstance().findOne({ _id: groupId })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (isNil(group)) {
      throw new GrpcError(status.NOT_FOUND, 'Group not found');
    }
    const memberships = await GroupMembership.getInstance().findMany({ user: { $in: ids }, group: groupId })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (memberships.length !== ids.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some users are not members of this group');
    }
    const whoRemovesMembership = await GroupMembership.getInstance().findOne(
      { $and: [{ group: groupId }, { user: whoRemoves._id }] },
      undefined,
      'roles',
    )
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    const canDelete = whoRemovesMembership!.permissions?.user.canDelete;
    if (canDelete) {
      await GroupUtils.removeUsersFromGroup(ids, groupId)
        .catch((e: Error) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      return 'Users were removed from group';
    } else if (!isNil(canDelete) && !canDelete) {
      throw new GrpcError(status.PERMISSION_DENIED, 'Permission Denied');
    } else {
      for (const role of whoRemovesMembership!.roles as Role[]) {
        if (role.permissions.user.canDelete) {
          await GroupUtils.removeUsersFromGroup(ids, groupId);
          return 'Users were removed from group';
        }
      }
    }
    throw new GrpcError(status.PERMISSION_DENIED, 'Permission Denied');
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

    const permissions = {
      user: {
        canDelete: true,
        canReset: true,
        canInvite: true,
        viewUsers: true,
        manageUsers: true,
      },
      group: {
        canModifyRole: true,
        canDelete: true,
        viewGroups: true,
      }, // the user who creates the group  has admin rights
    };
    const ownerRole = await Role.getInstance().create({
      name: 'Owner',
      group: groupName,
      permissions: permissions,
    }).catch((e: any) => {
      throw new GrpcError(status.INTERNAL, e.message);
    }); // create a default Role in the group


    const role = await Role.getInstance().findOne({ $and: [{ name: 'User' }, { group: groupName }] })
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    if (isNil(role)) {
      await Role.getInstance().create({
        name: 'User',
        group: groupName,
      }).catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
      // create a default Role in the group
    }

    await GroupMembership.getInstance().create({
      user: call.request.context.user._id,
      group: createdGroup._id,
      roles: [ownerRole._id],
    }).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });

    return { createdGroup };
  }

  async deleteGroup(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { id } = call.request.params;
    const { user } = call.request.context;
    const group = await Group.getInstance().findOne({ _id: id })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (isNil(group)) {
      throw new GrpcError(status.NOT_FOUND, 'Group not found');
    }
    const membership = await GroupMembership.getInstance().findOne(
      { group: id, user: user._id },
      undefined,
      'roles',
    ).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });

    const canDelete = membership?.permissions?.group?.canDelete;
    // TODO Delete subgroups also
    if (canDelete) {
      await GroupUtils.deleteGroup(group).catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
      return 'Group deleted';
    } else if (!isNil(canDelete) && !canDelete) {
      throw new GrpcError(status.PERMISSION_DENIED, 'Permission denied');
    } else {
      for (const roles of membership!.roles as Role[]) {
        if (roles.permissions.group.canDelete) {
          await GroupUtils.deleteGroup(group).catch((e: Error) => {
            throw new GrpcError(status.INTERNAL, e.message);
          });
        }
      }
      return 'Group deleted';
    }
  }

  async inviteUser(call: ParsedRouterRequest) {
    //roles which invitor go to  give in the invited user
    const { groupId, ids, roles } = call.request.params;
    const invitor = call.request.context.user;
    const group = await Group.getInstance().findOne({ _id: groupId })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    if (isNil(group)) {
      throw new GrpcError(status.NOT_FOUND, 'Group does not exist');
    }

    // TODO What if invited user does not exist ?
    const users = await User.getInstance().findMany({ _id: { $in: ids } });
    if (users.length !== ids.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some users were not found');
    }

    // let foundGroupRoles: Role[] = [];
    // if (!isNil(roles)) {
    //   foundGroupRoles = await Role.getInstance().findMany({ $and: [{ name: { $in: { roles } } }, { group: group.name }] })
    //     .catch((e: Error) => {
    //       throw new GrpcError(status.INTERNAL, e.message);
    //     });
    //   if (foundGroupRoles.length !== roles.length) {
    //     throw new GrpcError(status.NOT_FOUND, 'Some roles were not found');
    //   }
    // }
    //
    //
    // const canInvite = await GroupUtils.canInvite(invitor._id, group)
    //   .catch((e: Error) => {
    //     throw new GrpcError(status.INTERNAL, e.message);
    //   });
    //
    // if (canInvite) {
    //   for (const id of ids) {
    //     if (await GroupUtils.isGroupMember(id, groupId)) {
    //       throw new GrpcError(status.ALREADY_EXISTS, 'Cannot invite existing group user');
    //     }
    //     await GroupUtils.addGroupUser(id, group, foundGroupRoles)
    //       .catch((e: Error) => {
    //         throw new GrpcError(status.INTERNAL, e.message);
    //       });
    //   }
    // } else {
    //   throw new GrpcError(status.PERMISSION_DENIED, 'Permission denied');
    // }
    return 'Invite has been sent';
  }


}