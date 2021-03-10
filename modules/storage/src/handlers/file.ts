import { isString, isNil } from 'lodash';
import { IStorageProvider } from '@quintessential-sft/storage-provider';
import { v4 as uuid } from 'uuid';
import ConduitGrpcSdk, { RouterRequest, RouterResponse } from '@quintessential-sft/conduit-grpc-sdk';
import * as grpc from 'grpc';

export class FileHandlers {
  private database: any;
  private storageProvider: IStorageProvider;

  constructor(
    private readonly grpcSdk: ConduitGrpcSdk,
    storageProvider: IStorageProvider,
  ) {
    this.initDb(grpcSdk, storageProvider);
  }

  async initDb(grpcSdk: ConduitGrpcSdk, storageProvider: IStorageProvider) {
    await grpcSdk.waitForExistence('database-provider');
    this.database = grpcSdk.databaseProvider;
    this.storageProvider = storageProvider;
  }

  updateProvider(storageProvider: IStorageProvider) {
    this.storageProvider = storageProvider;
  }

  async createFile(call: RouterRequest, callback: RouterResponse) {
    const { name, data, folder, mimeType, isPublic } = JSON.parse(call.request.params);

    if (!isString(data)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid data provided',
      });
    }

    if (!isString(folder)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'No folder provided',
      });
    }

    const buffer = Buffer.from(data, 'base64');

    let errorMessage = null;

    await this.storageProvider
      .folderExists(folder)
      .then((exists) => {
        if (!exists) {
          return this.storageProvider.createFolder(folder);
        }
      })
      .then(() => {
        return this.storageProvider.folder(folder).store(name, buffer);
      })
      .catch((e: Error) => (errorMessage = e));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    let publicUrl = null;
    if (isPublic) {
      publicUrl = await this.storageProvider
        .folder(folder)
        .getPublicUrl(name)
        .catch((e) => (errorMessage = e.message));
      if (!isNil(errorMessage))
        return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }

    const newFile = await this.database
      .create('File', {
        name,
        mimeType,
        folder,
        isPublic,
        url: publicUrl,
      })
      .catch((e: any) => (errorMessage = e.message));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    return callback(null, {
      result: JSON.stringify({
        id: newFile._id,
        name: newFile.name,
        url: newFile.url,
      }),
    });
  }

  async getFile(call: RouterRequest, callback: RouterResponse) {
    const { id } = JSON.parse(call.request.params);
    if (!isString(id)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'The provided id is invalid',
      });
    }

    let errorMessage = null;
    const file = await this.database
      .findOne('File', { _id: id })
      .catch((e: any) => (errorMessage = e.message));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    if (isNil(file))
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'File not found',
      });

    return callback(null, {
      result: JSON.stringify({
        id: file._id,
        name: file.name,
        url: file.url,
      }),
    });
  }

  async getFileUrl(call: RouterRequest, callback: RouterResponse) {
    const { id } = JSON.parse(call.request.params);
    if (!isString(id)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'The provided id is invalid',
      });
    }

    let errorMessage = null;
    const found = await this.database.findOne('File', { _id: id })
      .catch((e: Error) => errorMessage = e.message);
    if (!isNil(errorMessage)) {
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }
    if (isNil(found)) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'File not found' });
    }
    if (found.isPublic) {
      return callback(null, { redirect: found.url });
    }
    return callback(null, {
      redirect: await this.storageProvider.folder(found.folder).getSignedUrl(found.name)
    });
  }

  async deleteFile(call: RouterRequest, callback: RouterResponse) {
    const { id } = JSON.parse(call.request.params);
    if (!isString(id)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'The provided id is invalid',
      });
    }

    let errorMessage = null;
    this.database
      .findOne('File', { _id: id })
      .then((found: any) => {
        if (isNil(found)) {
          throw new Error('File not found');
        }
        return this.storageProvider.folder(found.folder).delete(found.name);
      })
      .then((success: boolean) => {
        if (!success) {
          throw new Error('Error deleting the file');
        }
        return this.database.deleteOne('File', { _id: id });
      })
      .catch((e: any) => (errorMessage = e.message));

    return callback(null, { result: JSON.stringify({ success: true }) });
  }

  async updateFile(call: RouterRequest, callback: RouterResponse) {
    const { id, data, name, folder, mimeType } = JSON.parse(call.request.params);
    if (!isString(id)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'The provided id is invalid',
      });
    }

    let errorMessage = null;
    const found = await this.database
      .findOne('File', { _id: id })
      .catch((e: any) => (errorMessage = e.message));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    if (isNil(found)) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'File not found' });
    }

    // Create temporary file to make the changes so the original is not corrupted if anything fails
    const tempFileName = uuid();
    const oldData = await this.storageProvider
      .folder(found.folder)
      .get(found.name)
      .catch((error) => {
        errorMessage = 'Error reading file';
      });
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    const exists = await this.storageProvider
      .folder('temp')
      .exists('')
      .catch((e: any) => (errorMessage = e.message));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    if (!exists) {
      await this.storageProvider
        .folder('temp')
        .createFolder('')
        .catch((e: any) => (errorMessage = e.message));
      if (!isNil(errorMessage))
        return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }

    await this.storageProvider
      .folder('temp')
      .store(tempFileName, oldData)
      .catch((error) => {
        console.log(error);
        errorMessage = 'I/O Error';
      });
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    let failed = false;

    if (!isNil(data)) {
      const buffer = Buffer.from(data, 'base64');
      await this.storageProvider
        .folder('temp')
        .store(tempFileName, buffer)
        .catch((error) => {
          failed = true;
        });
    }

    const newName = name ?? found.name;
    const newFolder = folder ?? found.folder;

    const shouldRemove = newName !== found.name;

    found.mimeType = mimeType ?? found.mimeType;

    // Commit the changes to the actual file if everything is successful
    if (failed) {
      await this.storageProvider
        .folder('temp')
        .delete(tempFileName)
        .catch((e: any) => (errorMessage = e.message));
      if (!isNil(errorMessage))
        return callback({ code: grpc.status.INTERNAL, message: errorMessage });
      return callback({ code: grpc.status.INTERNAL, message: '' });
    }
    await this.storageProvider
      .folder('temp')
      .moveToFolderAndRename(tempFileName, newName, newFolder)
      .catch((error) => {
        errorMessage = 'I/O Error';
      });
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    if (shouldRemove) {
      await this.storageProvider
        .folder(found.folder)
        .delete(found.name)
        .catch((e: any) => (errorMessage = e.message));
      if (!isNil(errorMessage))
        return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }

    found.name = newName;
    found.folder = newFolder;

    const updatedFile = await this.database
      .findByIdAndUpdate('File', found)
      .catch((e: any) => (errorMessage = e.message));
    if (!isNil(errorMessage))
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });

    return callback(null, {
      result: JSON.stringify({
        id: updatedFile._id,
        name: updatedFile.name,
        url: updatedFile.url,
      }),
    });
  }
}
