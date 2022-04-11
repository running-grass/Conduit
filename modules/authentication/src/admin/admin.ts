import ConduitGrpcSdk, {
  GrpcServer,
  constructConduitRoute,
  ParsedRouterRequest,
  UnparsedRouterResponse,
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  GrpcError,
  RouteOptionType,
  ConduitString,
  ConduitNumber,
  ConduitBoolean,
  TYPE, ConduitJson,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil, merge } from 'lodash';
import { ServiceAdmin } from './service';
import { AuthUtils } from '../utils/auth';
import { User, Service, Role, Group, GroupMembership } from '../models';
import { RoleManager } from './roles';
import { GroupManager } from './groups';
import { GroupUtils } from '../utils/groupUtils';

const escapeStringRegexp = require('escape-string-regexp');

export class AdminHandlers {
  private readonly serviceAdmin: ServiceAdmin;
  private readonly roleManager: RoleManager;
  private readonly groupManager: GroupManager;

  constructor(private readonly server: GrpcServer, private readonly grpcSdk: ConduitGrpcSdk) {
    this.serviceAdmin = new ServiceAdmin(this.grpcSdk);
    this.roleManager = new RoleManager(this.grpcSdk);
    this.groupManager = new GroupManager(this.grpcSdk);
    this.registerAdminRoutes();
  }

  private registerAdminRoutes() {
    const paths = this.getRegisteredRoutes();
    this.grpcSdk.admin
      .registerAdminAsync(this.server, paths, {
        getUsers: this.getUsers.bind(this),
        createUser: this.createUser.bind(this),
        patchUser: this.patchUser.bind(this),
        deleteUser: this.deleteUser.bind(this),
        deleteUsers: this.deleteUsers.bind(this),
        toggleUsers: this.toggleUsers.bind(this),
        blockUser: this.blockUser.bind(this),
        unblockUser: this.unblockUser.bind(this),
        getServices: this.serviceAdmin.getServices.bind(this),
        createService: this.serviceAdmin.createService.bind(this),
        deleteService: this.serviceAdmin.deleteService.bind(this),
        renewServiceToken: this.serviceAdmin.renewToken.bind(this),
        createRole: this.roleManager.createRole.bind(this),
        patchRole: this.roleManager.patchRole.bind(this),
        getRoles: this.roleManager.getRoles.bind(this),

        createGroup: this.groupManager.createGroup.bind(this),
        getGroups: this.groupManager.getGroups.bind(this),
        deleteGroups: this.groupManager.deleteGroups.bind(this),

        getGroupMemberships: this.groupManager.getGroupMemberships.bind(this),
        addGroupMemberships: this.groupManager.addGroupMemberships.bind(this),
        removeGroupMemberships: this.groupManager.removeGroupMemberships.bind(this),
        //changeUserGroupPermissions: this.changeUserGroupPermissions.bind(this),
      })
      .catch((err: Error) => {
        console.log('Failed to register admin routes for module!');
        console.error(err);
      });
  }

  private getRegisteredRoutes(): any[] {
    return [
      // User Routes
      constructConduitRoute(
        {
          path: '/users',
          action: ConduitRouteActions.GET,
          queryParams: {
            skip: ConduitNumber.Optional,
            limit: ConduitNumber.Optional,
            isActive: ConduitBoolean.Optional,
            provider: ConduitString.Optional,
            search: ConduitString.Optional,
            sort: ConduitString.Optional,
          },
        },
        new ConduitRouteReturnDefinition('GetUsers', {
          users: [User.getInstance().fields],
          count: ConduitNumber.Required,
        }),
        'getUsers',
      ),
      constructConduitRoute(
        {
          path: '/users',
          action: ConduitRouteActions.POST,
          bodyParams: {
            identification: ConduitString.Required,
            password: ConduitString.Required,
          },
        },
        new ConduitRouteReturnDefinition('CreateUser', 'String'),
        'createUser',
      ),
      constructConduitRoute(
        {
          path: '/users/:id',
          action: ConduitRouteActions.PATCH,
          urlParams: {
            id: { type: RouteOptionType.String, required: true },
          },
          bodyParams: {
            email: ConduitString.Optional,
            isVerified: ConduitBoolean.Optional,
            hasTwoFA: ConduitBoolean.Optional,
            phoneNumber: ConduitString.Optional,
          },
        },
        new ConduitRouteReturnDefinition('PatchUser', 'String'),
        'patchUser',
      ),
      constructConduitRoute(
        {
          path: '/users',
          action: ConduitRouteActions.DELETE,
          queryParams: {
            ids: { type: [TYPE.String], required: true }, // handler array check is still required
          },
        },
        new ConduitRouteReturnDefinition('DeleteUsers', 'String'),
        'deleteUsers',
      ),
      constructConduitRoute(
        {
          path: '/users/:id',
          action: ConduitRouteActions.DELETE,
          urlParams: {
            id: { type: RouteOptionType.String, required: true },
          },
        },
        new ConduitRouteReturnDefinition('DeleteUser', 'String'),
        'deleteUser',
      ),
      constructConduitRoute(
        {
          path: '/users/:id/block',
          action: ConduitRouteActions.POST,
          urlParams: {
            id: { type: RouteOptionType.String, required: true },
          },
        },
        new ConduitRouteReturnDefinition('BlockUser', 'String'),
        'blockUser',
      ),
      constructConduitRoute(
        {
          path: '/users/:id/unblock',
          action: ConduitRouteActions.POST,
          urlParams: {
            id: { type: RouteOptionType.String, required: true },
          },
        },
        new ConduitRouteReturnDefinition('UnblockUser', 'String'),
        'unblockUser',
      ),
      constructConduitRoute(
        {
          path: '/users/toggle',
          action: ConduitRouteActions.POST,
          bodyParams: {
            ids: { type: [TYPE.String], required: true }, // handler array check is still required
            block: ConduitBoolean.Required,
          },
        },
        new ConduitRouteReturnDefinition('ToggleUsers', 'String'),
        'toggleUsers',
      ),
      // Service Routes
      constructConduitRoute(
        {
          path: '/services',
          action: ConduitRouteActions.GET,
          queryParams: {
            skip: ConduitNumber.Optional,
            limit: ConduitNumber.Optional,
          },
          name: 'GetServices',
          description: 'Returns registered services',
        },
        new ConduitRouteReturnDefinition('GetServices', {
          services: [Service.getInstance().fields],
          count: ConduitNumber.Required,
        }),
        'getServices',
      ),
      constructConduitRoute(
        {
          path: '/services',
          action: ConduitRouteActions.POST,
          bodyParams: {
            name: ConduitString.Required,
          },
          name: 'CreateService',
          description: 'Registers a new service',
        },
        new ConduitRouteReturnDefinition('CreateService', {
          name: ConduitString.Required,
          token: ConduitString.Required,
        }),
        'createService',
      ),
      constructConduitRoute(
        {
          path: '/services/:id',
          action: ConduitRouteActions.DELETE,
          urlParams: {
            id: ConduitString.Required,
          },
          name: 'DeleteService',
          description: 'Deletes a service',
        },
        new ConduitRouteReturnDefinition('DeleteService', 'String'),
        'deleteService',
      ),
      constructConduitRoute(
        {
          path: '/services/:serviceId/token',
          action: ConduitRouteActions.GET,
          urlParams: {
            serviceId: ConduitString.Required,
          },
          name: 'RenewServiceToken',
          description: 'Renews a service token',
        },
        new ConduitRouteReturnDefinition('RenewServiceToken', {
          name: ConduitString.Required,
          token: ConduitString.Required,
        }),
        'renewServiceToken',
      ),
      constructConduitRoute(
        {
          path: '/group/roles',
          action: ConduitRouteActions.GET,
          queryParams: {
            skip: ConduitNumber.Optional,
            limit: ConduitNumber.Optional,
            search: ConduitString.Optional,
            sort: ConduitString.Optional,
            groupNames: { type: [TYPE.String], required: false },
          },
          name: 'GetRoles',
          description: 'Fetching Roles of a Group',
        },
        new ConduitRouteReturnDefinition('GetRoles', Role.getInstance().fields),
        'getRoles',
      ),
      constructConduitRoute(
        {
          path: '/group/role',
          action: ConduitRouteActions.POST,
          bodyParams: {
            name: ConduitString.Required,
            groupId: ConduitString.Optional,
          },
          name: 'CreateRole',
          description: 'Creates a new user role',
        },
        new ConduitRouteReturnDefinition('CreateRole', Role.getInstance().fields),
        'createRole',
      ),
      constructConduitRoute(
        {
          path: '/group/role/:id',
          action: ConduitRouteActions.PATCH,
          urlParams: {
            id: { type: RouteOptionType.String, required: true },
          },
          bodyParams: {
            name: ConduitString.Optional,
            permissions: {
              user: { type: TYPE.JSON, required: false },
              group: { type: TYPE.JSON, required: false },
            },
          },
          name: 'PatchRole',
          description: 'Patch a role',
        },
        new ConduitRouteReturnDefinition('PatchRole', Role.getInstance().fields),
        'patchRole',
      ),
      // constructConduitRoute(
      //   {
      //     path: '/group/users/permissions',
      //     action: ConduitRouteActions.PATCH,
      //     bodyParams: {
      //       userId: ConduitString.Required,
      //       groupId: ConduitString.Optional,
      //       permissions: {
      //         user: { type: TYPE.JSON, required: false },
      //         group: { type: TYPE.JSON, required: false },
      //       },
      //     },
      //     name: 'ChangeUserGroupPermissions',
      //     description: 'Change permissions of a user',
      //   },
      //   new ConduitRouteReturnDefinition('ChangeUserGroupPermissions', {
      //     roleMembership: [RoleMembership.getInstance().fields],
      //     count: ConduitNumber.Required,
      //   }),
      //   'changeUserGroupPermissions',
      // ),
      constructConduitRoute(
        {
          path: '/groups',
          action: ConduitRouteActions.GET,
          queryParams: {
            skip: ConduitNumber.Optional,
            limit: ConduitNumber.Optional,
            search: ConduitString.Optional,
            sort: ConduitString.Optional,
          },
          name: 'GetGroups',
          description: 'Get Groups',
        },
        new ConduitRouteReturnDefinition('GetGroups', {
          groups: [Group.getInstance().fields],
          count: ConduitNumber.Required,
        }),
        'getGroups',
      ),
      constructConduitRoute(
        {
          path: '/group',
          action: ConduitRouteActions.POST,
          bodyParams: {
            name: ConduitString.Required,
          },
          name: 'CreateGroup',
          description: 'Creates a new Group',
        },
        new ConduitRouteReturnDefinition('CreateGroup', Group.getInstance().fields),
        'createGroup',
      ),
      constructConduitRoute(
        {
          path: '/groups',
          action: ConduitRouteActions.DELETE,
          bodyParams: {
            ids: { type: [TYPE.String], required: true }
          },
          name: 'DeleteGroups',
          description: 'Deleting Groups',
        },
        new ConduitRouteReturnDefinition('DeleteGroups', 'String'),
        'deleteGroups',
      ),
      constructConduitRoute(
        {
          path: '/group/memberships',
          action: ConduitRouteActions.POST,
          bodyParams: {
            memberships: [{
              user: ConduitString.Required,
              group: ConduitString.Required,
              roles: { type: [TYPE.String], required: true },
            }],
          },
          name: 'AddGroupMemberships',
          description: 'Add users to group',
        },
        new ConduitRouteReturnDefinition('AddGroupMemberships', GroupMembership.getInstance().fields),
        'addGroupMemberships',
      ),
      constructConduitRoute(
        {
          path: '/group/memberships',
          action: ConduitRouteActions.GET,
          queryParams: {
            groupId: ConduitString.Optional,
          },
          name: 'GetGroupMemberships',
          description: 'Given a group this route fetches its members.',
        },
        new ConduitRouteReturnDefinition('GetGroupMemberships', {
          memberships: ConduitJson.Required,
          count: ConduitNumber.Required,
        }),
        'getGroupMemberships',
      ),
      constructConduitRoute(
        {
          path: '/group/memberships',
          action: ConduitRouteActions.DELETE,
          bodyParams: {
            groupId: ConduitString.Required,
            ids: [ConduitString.Required],
          },
          name: 'RemoveGroupMemberships',
          description: 'Remove group memberships',
        },
        new ConduitRouteReturnDefinition('GetGroupMemberships', 'String'),
        'removeGroupMemberships',
      ),
    ];
  }

  async getUsers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { isActive, provider, search, sort } = call.request.params;
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;

    let query: any = {};
    if (!isNil(isActive)) {
      query.active = isActive;
    }
    if (!isNil(provider)) {
      if (provider === 'local') {
        query['hashedPassword'] = { $exists: true, $ne: null };
      } else {
        query[provider] = { $exists: true, $ne: null };
      }
    }
    let identifier;
    if (!isNil(search)) {
      if (search.match(/^[a-fA-F0-9]{24}$/)) {
        query = { _id: search };
      } else {
        const emailIdentifier = escapeStringRegexp(search);
        query['email'] = { $regex: `.*${emailIdentifier}.*`, $options: 'i' };
      }
    }

    const users: User[] = await User.getInstance().findMany(
      query,
      undefined,
      skip,
      limit,
      sort,
    );
    const count: number = await User.getInstance().countDocuments(query);

    return { users, count };
  }

  async createUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let { email, password } = call.request.params;
    if (AuthUtils.invalidEmailAddress(email)) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'Invalid email address provided');
    }

    let user: User | null = await User.getInstance().findOne({
      email: email.toLowerCase(),
    });
    if (!isNil(user)) {
      throw new GrpcError(status.ALREADY_EXISTS, 'User already exists');
    }

    let hashedPassword = await AuthUtils.hashPassword(password);
    user = await User.getInstance().create({
      email,
      hashedPassword,
      isVerified: true,
    });
    this.grpcSdk.bus?.publish('authentication:register:user', JSON.stringify(user));

    await GroupUtils.createDefaultRole(user, ''); // when a user is created it belongs to 'general' group

    return 'Registration was successful';
  }

  async patchUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { id, email, isVerified, hasTwoFA, phoneNumber } = call.request.params;

    let user: User | null = await User.getInstance().findOne({ _id: id });
    if (isNil(user)) {
      throw new GrpcError(status.NOT_FOUND, 'User does not exist');
    } else if (hasTwoFA && isNil(phoneNumber) && isNil(user.phoneNumber)) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'Can not enable 2fa without a phone number');
    }

    const query = {
      email: email ?? user.email,
      isVerified: isVerified ?? user.isVerified,
      hasTwoFA: hasTwoFA ?? user.hasTwoFA,
      phoneNumber: phoneNumber ?? user.phoneNumber,
    };

    let res: User | null = await User.getInstance().findByIdAndUpdate(user._id, query);
    this.grpcSdk.bus?.publish('authentication:update:user', JSON.stringify(res));
    return 'User updated';
  }

  async deleteUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let user: User | null = await User.getInstance().findOne({ _id: call.request.params.id });
    if (isNil(user)) {
      throw new GrpcError(status.NOT_FOUND, 'User does not exist');
    }
    let res = await User.getInstance().deleteOne({ _id: call.request.params.id });
    this.grpcSdk.bus?.publish('authentication:delete:user', JSON.stringify(res));
    return 'User was deleted';
  }

  async deleteUsers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { ids } = call.request.params;
    if (ids.length === 0) { // array check is required
      throw new GrpcError(status.INVALID_ARGUMENT, 'ids is required and must be an non-empty array');
    }

    let users: User[] = await User.getInstance().findMany({ _id: { $in: ids } });
    if (users.length === 0) {
      throw new GrpcError(status.NOT_FOUND, 'User does not exist');
    }

    let res = await User.getInstance().deleteMany({ _id: { $in: ids } });
    this.grpcSdk.bus?.publish('authentication:delete:user', JSON.stringify(res));
    return 'Users were deleted';
  }

  async blockUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let user: User | null = await User.getInstance().findOne({ _id: call.request.params.id });
    if (isNil(user)) {
      throw new GrpcError(status.NOT_FOUND, 'User does not exist');
    }
    if (!user.active) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'User is already blocked');
    }
    user.active = false;
    user = await User.getInstance().findByIdAndUpdate(user._id, user);
    this.grpcSdk.bus?.publish('authentication:block:user', JSON.stringify(user));
    return 'User was blocked';
  }

  async unblockUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let user: User | null = await User.getInstance().findOne({ _id: call.request.params.id });
    if (isNil(user)) {
      throw new GrpcError(status.NOT_FOUND, 'User does not exist');
    }
    if (user.active) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'user is not blocked');
    }
    user.active = true;
    user = await User.getInstance().findByIdAndUpdate(user._id, user);
    this.grpcSdk.bus?.publish('authentication:unblock:user', JSON.stringify(user));
    return 'User was unblocked';
  }

  async toggleUsers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { ids, block } = call.request.params;
    if (ids.length === 0) { // array check is required
      throw new GrpcError(status.INVALID_ARGUMENT, 'ids is required and must be a non-empty array');
    }
    let users: User[] | null = await User.getInstance().findMany({ _id: { $in: ids } });
    if (users.length === 0) {
      throw new GrpcError(status.NOT_FOUND, 'Users do not exist');
    }
    await User.getInstance().updateMany({ _id: { $in: ids } }, { active: block }, true);
    if (block) {
      this.grpcSdk.bus?.publish('authentication:block:user', JSON.stringify(users));
      return 'Users were blocked';
    } else {
      this.grpcSdk.bus?.publish('authentication:unblock:user', JSON.stringify(users));
      return 'Users were unblocked';
    }
  }

  // async changeUserGroupPermissions(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
  //   const { userId, groupId, permissions } = call.request.params;
  //   const user = await User.getInstance().findOne({ _id: userId })
  //     .catch((e: any) => {
  //       throw new GrpcError(status.INTERNAL, e.message);
  //     });
  //   if (isNil(user)) {
  //     throw new GrpcError(status.NOT_FOUND, 'User not found');
  //   }
  //
  //   if (!isNil(groupId)) {
  //     const group = await Group.getInstance().findOne({ _id: groupId })
  //       .catch((e: any) => {
  //         throw new GrpcError(status.INTERNAL, e.message);
  //       });
  //     if (isNil(group)) {
  //       throw new GrpcError(status.NOT_FOUND, 'Group not found');
  //     }
  //
  //     const groupMembership = await GroupMembership.getInstance().findOne({ user: userId, group: groupId })
  //       .catch((e: any) => {
  //         throw new GrpcError(status.INTERNAL, e.message);
  //       });
  //     if (isNil(groupMembership)) {
  //       throw new GrpcError(status.NOT_FOUND, 'User is not a member of this group');
  //     }
  //
  //     const userRoles = groupMembership.roles;
  //     const roleIds: Role[] = await Role.getInstance().findMany({ name: { $in: userRoles }, group: group.name }, '_id')
  //       .catch((e: any) => {
  //         throw new GrpcError(status.INTERNAL, e.message);
  //       });
  //     const filterQuery = { $and: [{ user: userId }, { role: { $in: roleIds } }] };
  //   }
  //
  //   return 5 as any;
  //
  // }
}
