"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PKG_HEAD_BYTES = 4;
exports.MSG_FLAG_BYTES = 1;
exports.MSG_ROUTE_CODE_BYTES = 2;
exports.MSG_ID_MAX_BYTES = 5;
exports.MSG_ROUTE_LEN_BYTES = 1;
exports.MSG_ROUTE_CODE_MAX = 0xffff;
exports.MSG_COMPRESS_ROUTE_MASK = 0x1;
exports.MSG_COMPRESS_GZIP_MASK = 0x1;
exports.MSG_COMPRESS_GZIP_ENCODE_MASK = 1 << 4;
exports.MSG_TYPE_MASK = 0x7;
var PackageType;
(function (PackageType) {
    PackageType[PackageType["TYPE_HANDSHAKE"] = 1] = "TYPE_HANDSHAKE";
    PackageType[PackageType["TYPE_HANDSHAKE_ACK"] = 2] = "TYPE_HANDSHAKE_ACK";
    PackageType[PackageType["TYPE_HEARTBEAT"] = 3] = "TYPE_HEARTBEAT";
    PackageType[PackageType["TYPE_DATA"] = 4] = "TYPE_DATA";
    PackageType[PackageType["TYPE_KICK"] = 5] = "TYPE_KICK";
})(PackageType = exports.PackageType || (exports.PackageType = {}));
var MessageType;
(function (MessageType) {
    MessageType[MessageType["TYPE_REQUEST"] = 0] = "TYPE_REQUEST";
    MessageType[MessageType["TYPE_NOTIFY"] = 1] = "TYPE_NOTIFY";
    MessageType[MessageType["TYPE_RESPONSE"] = 2] = "TYPE_RESPONSE";
    MessageType[MessageType["TYPE_PUSH"] = 3] = "TYPE_PUSH";
})(MessageType = exports.MessageType || (exports.MessageType = {}));
function msgHasId(type) {
    return type === MessageType.TYPE_REQUEST || type === MessageType.TYPE_RESPONSE;
}
;
function msgHasRoute(type) {
    return type === MessageType.TYPE_REQUEST || type === MessageType.TYPE_NOTIFY || type === MessageType.TYPE_PUSH;
}
;
function caculateMsgIdBytes(id) {
    let len = 0;
    do {
        len += 1;
        id >>= 7;
    } while (id > 0);
    return len;
}
;
function encodeMsgFlag(type, compressRoute, buffer, offset, compressGzip) {
    if (type !== MessageType.TYPE_REQUEST && type !== MessageType.TYPE_NOTIFY &&
        type !== MessageType.TYPE_RESPONSE && type !== MessageType.TYPE_PUSH) {
        throw new Error('unkonw message type: ' + type);
    }
    buffer[offset] = (type << 1) | (compressRoute ? 1 : 0);
    if (compressGzip) {
        buffer[offset] = buffer[offset] | exports.MSG_COMPRESS_GZIP_ENCODE_MASK;
    }
    return offset + exports.MSG_FLAG_BYTES;
}
;
function encodeMsgId(id, buffer, offset) {
    do {
        let tmp = id % 128;
        const next = Math.floor(id / 128);
        if (next !== 0) {
            tmp = tmp + 128;
        }
        buffer[offset++] = tmp;
        id = next;
    } while (id !== 0);
    return offset;
}
;
function encodeMsgRoute(compressRoute, route, buffer, offset) {
    if (compressRoute) {
        if (route > exports.MSG_ROUTE_CODE_MAX) {
            throw new Error('route number is overflow');
        }
        buffer[offset++] = (route >> 8) & 0xff;
        buffer[offset++] = route & 0xff;
    }
    else {
        if (route) {
            buffer[offset++] = route.length & 0xff;
            copyArray(buffer, offset, route, 0, route.length);
            offset += route.length;
        }
        else {
            buffer[offset++] = 0;
        }
    }
    return offset;
}
;
function encodeMsgBody(msg, buffer, offset) {
    copyArray(buffer, offset, msg, 0, msg.length);
    return offset + msg.length;
}
;
function copyArray(dest, doffset, src, soffset, length) {
    for (let index = 0; index < length; index++) {
        dest[doffset++] = src[soffset++];
    }
}
;
/**
 * pomele client encode
 * id message id;
 * route message route
 * msg message body
 * socketio current support string
 */
function strencode(str) {
    const byteArray = new Uint8Array(str.length * 3);
    let offset = 0;
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        let codes = null;
        if (charCode <= 0x7f) {
            codes = [charCode];
        }
        else if (charCode <= 0x7ff) {
            codes = [0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f)];
        }
        else {
            codes = [0xe0 | (charCode >> 12), 0x80 | ((charCode & 0xfc0) >> 6), 0x80 | (charCode & 0x3f)];
        }
        for (var j = 0; j < codes.length; j++) {
            byteArray[offset] = codes[j];
            ++offset;
        }
    }
    const _buffer = new Uint8Array(offset);
    copyArray(_buffer, 0, byteArray, 0, offset);
    return _buffer;
}
exports.strencode = strencode;
;
/**
   * client decode
   * msg String data
   * return Message Object
   */
function strdecode(buffer) {
    const bytes = new Uint8Array(buffer);
    const array = [];
    let offset = 0;
    let charCode = 0;
    const end = bytes.length;
    while (offset < end) {
        if (bytes[offset] < 128) {
            charCode = bytes[offset];
            offset += 1;
        }
        else if (bytes[offset] < 224) {
            charCode = ((bytes[offset] & 0x1f) << 6) + (bytes[offset + 1] & 0x3f);
            offset += 2;
        }
        else {
            charCode = ((bytes[offset] & 0x0f) << 12) + ((bytes[offset + 1] & 0x3f) << 6) + (bytes[offset + 2] & 0x3f);
            offset += 3;
        }
        array.push(charCode);
    }
    return String.fromCharCode.apply(null, array);
}
exports.strdecode = strdecode;
;
var Package;
(function (Package) {
    /**
     * Package protocol encode.
     *
     * Pomelo package format:
     * +------+-------------+------------------+
     * | type | body length |       body       |
     * +------+-------------+------------------+
     *
     * Head: 4bytes
     *   0: package type,
     *      1 - handshake,
     *      2 - handshake ack,
     *      3 - heartbeat,
     *      4 - data
     *      5 - kick
     *   1 - 3: big-endian body length
     * Body: body length bytes
     *
     * @param  {Number}    type   package type
     * @param  {ByteArray} body   body content in bytes
     * @return {ByteArray}        new byte array that contains encode result
     */
    function encode(type, body) {
        let length = body ? body.length : 0;
        const buffer = new Uint8Array(exports.PKG_HEAD_BYTES + length);
        let index = 0;
        buffer[index++] = type & 0xff;
        buffer[index++] = (length >> 16) & 0xff;
        buffer[index++] = (length >> 8) & 0xff;
        buffer[index++] = length & 0xff;
        if (body) {
            copyArray(buffer, index, body, 0, length);
        }
        return buffer;
    }
    Package.encode = encode;
    ;
    /**
     * Package protocol decode.
     * See encode for package format.
     *
     * @param  {Uint8Array} buffer byte array containing package content
     * @return {Object}           {type: package type, buffer: body byte array}
     */
    function decode(buffer) {
        let offset = 0;
        const bytes = new Uint8Array(buffer);
        let length = 0;
        const rs = [];
        while (offset < bytes.length) {
            var type = bytes[offset++];
            length = ((bytes[offset++]) << 16 | (bytes[offset++]) << 8 | bytes[offset++]) >>> 0;
            var body = length ? new Uint8Array(length) : null;
            if (body) {
                copyArray(body, 0, bytes, offset, length);
            }
            offset += length;
            rs.push({ 'type': type, 'body': body });
        }
        return rs.length === 1 ? rs[0] : rs;
    }
    Package.decode = decode;
    ;
})(Package = exports.Package || (exports.Package = {}));
var Message;
(function (Message) {
    /**
     * Message protocol encode.
     *
     * @param  {Number} id            message id
     * @param  {Number} type          message type
     * @param  {Number} compressRoute whether compress route
     * @param  {Number|String} route  route code or route string
     * @param  {Buffer} msg           message body bytes
     * @return {Buffer}               encode result
     */
    function encode(id, type, compressRoute, route, msg, compressGzip) {
        // caculate message max length
        const idBytes = msgHasId(type) ? caculateMsgIdBytes(id) : 0;
        let msgLen = exports.MSG_FLAG_BYTES + idBytes;
        if (msgHasRoute(type)) {
            if (compressRoute) {
                if (typeof route !== 'number') {
                    throw new Error('error flag for number route!');
                }
                msgLen += exports.MSG_ROUTE_CODE_BYTES;
            }
            else {
                msgLen += exports.MSG_ROUTE_LEN_BYTES;
                if (route) {
                    route = strencode(route);
                    if (route.length > 255) {
                        throw new Error('route maxlength is overflow');
                    }
                    msgLen += route.length;
                }
            }
        }
        if (msg) {
            msgLen += msg.length;
        }
        var buffer = new Uint8Array(msgLen);
        var offset = 0;
        // add flag
        offset = encodeMsgFlag(type, compressRoute, buffer, offset, compressGzip);
        // add message id
        if (msgHasId(type)) {
            offset = encodeMsgId(id, buffer, offset);
        }
        // add route
        if (msgHasRoute(type)) {
            offset = encodeMsgRoute(compressRoute, route, buffer, offset);
        }
        // add body
        if (msg) {
            offset = encodeMsgBody(msg, buffer, offset);
        }
        return buffer;
    }
    Message.encode = encode;
    ;
    /**
     * Message protocol decode.
     *
     * @param  {Uint8Array} buffer message bytes
     * @return {Object}            message object
     */
    function decode(buffer) {
        var bytes = new Uint8Array(buffer);
        var bytesLen = bytes.length || bytes.byteLength;
        var offset = 0;
        var id = 0;
        var route = null;
        // parse flag
        var flag = bytes[offset++];
        var compressRoute = flag & exports.MSG_COMPRESS_ROUTE_MASK;
        var type = (flag >> 1) & exports.MSG_TYPE_MASK;
        var compressGzip = (flag >> 4) & exports.MSG_COMPRESS_GZIP_MASK;
        // parse id
        if (msgHasId(type)) {
            var m = 0;
            var i = 0;
            do {
                m = bytes[offset];
                id += (m & 0x7f) << (7 * i);
                offset++;
                i++;
            } while (m >= 128);
        }
        // parse route
        if (msgHasRoute(type)) {
            if (compressRoute) {
                route = (bytes[offset++]) << 8 | bytes[offset++];
            }
            else {
                var routeLen = bytes[offset++];
                if (routeLen) {
                    route = new Uint8Array(routeLen);
                    copyArray(route, 0, bytes, offset, routeLen);
                    route = strdecode(route);
                }
                else {
                    route = '';
                }
                offset += routeLen;
            }
        }
        // parse body
        var bodyLen = bytesLen - offset;
        var body = new Uint8Array(bodyLen);
        copyArray(body, 0, bytes, offset, bodyLen);
        return {
            'id': id, 'type': type, 'compressRoute': compressRoute,
            'route': route, 'body': body, 'compressGzip': compressGzip
        };
    }
    Message.decode = decode;
    ;
})(Message = exports.Message || (exports.Message = {}));