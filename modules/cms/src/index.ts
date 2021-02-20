import ConduitGrpcSdk from "@quintessential-sft/conduit-grpc-sdk";
import {CMS} from './CMS';
import * as process from "process";

let paths = require("./admin/admin.json")
if (!process.env.CONDUIT_SERVER) {
    throw new Error("Conduit server URL not provided");
}

let grpcSdk = new ConduitGrpcSdk(process.env.CONDUIT_SERVER, 'cms');
let cms = new CMS(grpcSdk);
let url = cms.url;
if (process.env.REGISTER_NAME === 'true') {
    url = 'cms:' + url.split(':')[1];
}
grpcSdk.config.registerModule('cms', url)
    .catch(err => {
        console.error(err)
        process.exit(-1);
    })
    .then(() => {
        grpcSdk.admin.register(paths.functions)
    })
    .catch((err: Error) => {
        console.log("Failed to register admin routes for CMS module!")
        console.error(err);
    });
