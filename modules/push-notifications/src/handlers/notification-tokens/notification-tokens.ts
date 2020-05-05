import { isNil } from 'lodash';
import { ConduitRouteParameters, ConduitSDK, ConduitError } from '@conduit/sdk';

export class NotificationTokensHandler {
  private readonly pushNotificationModel: any;

  constructor(conduit: ConduitSDK) {
    const databaseAdapter = conduit.getDatabase();
    this.pushNotificationModel = databaseAdapter.getSchema('NotificationToken');
  }

  async setNotificationToken(params: ConduitRouteParameters) {
    const { token, platform } = params.params as any;
    if (isNil(token) || isNil(platform)) {
      throw ConduitError.userInput('Required fields are missing');
    }
    const userId = (params.context as any).user._id;

    const oldToken = await this.pushNotificationModel.findOne({userId, platform});
    if (!isNil(oldToken)) await this.pushNotificationModel.deleteOne(oldToken);

    const newTokenDocument = await this.pushNotificationModel.create({
      userId,
      token,
      platform
    });

    return { message: 'Push notification token created', newTokenDocument };
  }

}