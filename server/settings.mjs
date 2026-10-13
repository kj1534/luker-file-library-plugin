import {isAllowedVideoModel} from '../media.js';
export const defaults={upstream:'',models:[],bucket:'',port:18779,prepare_ttl_ms:120000,request_timeout_ms:300000,max_upload_bytes:2147483648,https_max_bytes:14000000,direct_media_origins:[]};
export const allowsModel=(config,model)=>isAllowedVideoModel(config.models,model);
