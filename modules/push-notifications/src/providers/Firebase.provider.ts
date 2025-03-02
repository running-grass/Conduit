import { IPushNotificationsProvider } from '../interfaces/IPushNotificationsProvider';
import { IFirebaseSettings } from '../interfaces/IFirebaseSettings';
import * as firebase from 'firebase-admin';
import {
  ISendNotification,
  ISendNotificationToManyDevices,
} from '../interfaces/ISendNotification';
import { isNil, keyBy } from 'lodash';
import { NotificationToken } from '../models';

export class FirebaseProvider implements IPushNotificationsProvider {
  private readonly fcm: firebase.messaging.Messaging;

  constructor(settings: IFirebaseSettings) {
    const serviceAccount: firebase.ServiceAccount = {
      projectId: settings.projectId,
      privateKey: settings.privateKey.replace(/\\n/g, '\n'),
      clientEmail: settings.clientEmail,
    };
    const firebaseOptions: firebase.AppOptions = {
      credential: firebase.credential.cert(serviceAccount),
    };
    try {
      this.fcm = firebase.app(serviceAccount.projectId).messaging();
    } catch (e) {
      this.fcm = firebase
        .initializeApp(firebaseOptions, serviceAccount.projectId)
        .messaging();
    }
  }

  // TODO check for disabled notifications for users

  async sendToDevice(params: ISendNotification) {
    const { sendTo, type } = params;
    const userId = sendTo;
    if (isNil(userId)) return;

    const notificationToken = await NotificationToken.getInstance().findOne({
      userId,
    });
    if (isNil(notificationToken)) {
      return;
    }
    const { title, body, data } = params;
    const message: firebase.messaging.Message = {
      token: notificationToken.token,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        type: type ?? '',
      },
    };
    return this.fcm.send(message);
  }

  async sendMany(params: ISendNotification[]) {
    const userIds = params.map(param => param.sendTo);
    const notificationsObj = keyBy(params, param => param.sendTo);

    const notificationTokens = await NotificationToken.getInstance().findMany({
      userId: { $in: userIds },
    });

    const promises = notificationTokens.map(async token => {
      const id = token.userId.toString();
      const data = notificationsObj[id];

      const message: firebase.messaging.Message = {
        notification: {
          title: data.title,
          body: data.body,
        },
        data: {
          ...data.data,
          type: data.type ?? '',
        },
        token: token.token,
      };

      await this.fcm.send(message).catch(console.error);
    });
    return Promise.all(promises);
  }

  async sendToManyDevices(params: ISendNotificationToManyDevices) {
    const notificationTokens = await NotificationToken.getInstance().findMany({
      userId: { $in: params.sendTo },
    });
    if (notificationTokens.length === 0) return;

    const promises = notificationTokens.map(async notToken => {
      const message: firebase.messaging.Message = {
        token: notToken.token,
        notification: {
          title: params.title,
          body: params.body,
        },
        data: {
          ...params.data,
          type: params.type ?? '',
        },
      };
      await this.fcm.send(message);
    });
    return Promise.all(promises);
  }
}
