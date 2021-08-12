/**
 * 该包装插件基于axios包装，用于请求Weforward网关数据
 * 主要功能：简化业务的请求参数和配置，提供统一的登录和退出登录方法，实现简单的负载均衡
 */
import axios from 'axios';
import extend from './es6extend.js'
import cookie from './cookie.js'
import sha256 from './sha256.js';
import storage from './storage.js'
import hexToBase64 from './hexToBase64.js';
/**
 * weforward配置
 * 如:
 * window._WEFORWARD_CONFIG={
 *	"hosts": [
 *		"//lgateway.navboy.com"
 *	]
 * };
 */
//通道允许上传的单个文件大小
const ALLOWSINGLEFILESIZE = 1024 * 1024 * 3;
//异常监听事件
const EVENTS = {};
//业务层全局参数
const GLOBAL = {};
//全局配置参数
const GLOBALCONFIG = {};
//服务tag
const SERVICE_TAGS = storage.tem.getObj('__WF_SERVICE_TAGS') || {};
//开发环境服务名映射
const SERVICENAMEMAP = {};
//环境服务名版本
const SERVICE_VERSIONS = {};
//自定义事件
const CUSTOMEVENTS = [];
//全局配置
const NOAUTHDEFCONFIG = {
	withoutaccessid: true,
	resDataMode: 0,
	resDataAttrNameStyle: 1,
	reqDataAttrNameStyle: 1
};
//记录失败的接口调用信息
const API_FAIL_RECORD = {};

//鉴权链接
let baseURL = '';
//默认服务名
let baseServiceName = '';
//域名列表
let baseUrls = [];
//当前域名
let baseUrl = '';
//允许重试最大次数
let _maxretrycount = 1;
//成功回调时是否轮流切换url
let ISRECYCLEURLS = false;
//默认1,0:不转换，1、下划线转驼峰，2、兼容默认，转驼峰的同时保留原属性
let defalutResDataAttrNameStyle = 1;
//默认1,0:不转换驼峰，1、下划线转驼峰
let defalutReqDataAttrNameStyle = 1;
//默认0，0:纯业务数据，1:包含code等信息的包装数据(需要登录或者无访问权限时不受该参数控制)
let defalutResDataMode = 0;
//请求次数计数器
let requestCounter = 0;

const WF_CONFIG = window._WEFORWARD_CONFIG;
if (WF_CONFIG) {
	setBaseHosts.apply(null, WF_CONFIG.hosts);
	let developServiceName = WF_CONFIG.serviceName;
	if (developServiceName) {
		if (developServiceName.match(/,|:/)) {
			developServiceName.split(',').forEach(item => {
				if (!item) {
					return;
				}
				let kv = item.split(':');
				if (kv.length == 1) {
					SERVICENAMEMAP[kv[0]] = kv[0];
					return;
				}
				SERVICENAMEMAP[kv[0]] = kv[1];
			});
			developServiceName = '';
		}
		setBaseService.apply(null, [developServiceName]);
	}
} else {
	setBaseHosts.apply(null, exchangeHostToHosts(process.env.VUE_APP_WF_HOST))
	let developServiceName = process.env.VUE_APP_DEV_SERVICENAME;
	if (developServiceName) {
		if (developServiceName.match(/,|:/)) {
			developServiceName.split(',').forEach(item => {
				if (!item) {
					return;
				}
				let kv = item.split(':');
				if (kv.length == 1) {
					SERVICENAMEMAP[kv[0]] = kv[0];
					return;
				}
				SERVICENAMEMAP[kv[0]] = kv[1];
			});
			developServiceName = '';
		}
		setBaseService.apply(null, [developServiceName]);
	}
}

axios.defaults.headers.post['Content-Type'] = 'application/json;charset=utf-8';

/**
 * 配置服务请求域名（请求服务的urls）
 * @param {String} urls 支持多个参数url用于负载均衡
 */
function setBaseHosts(...urls) {
	let _urls = [];
	for (let url of urls) {
		if (!url) {
			continue;
		}
		checkHost(url, _urls);
		_urls.push(url);
	}
	baseUrls = _urls;
	if (baseUrls.length > 0) {
		baseUrl = _urls[0];
	}
}

/**
 * 配置基础服务名称
 * @param {Object} serviceName 服务名称,至少一位及以上，数字，字母，下划线
 */
function setBaseService(serviceName) {
	checkServiceName(serviceName);
	baseServiceName = serviceName;
}
/**
 * 获取链接列表
 */
function getBaseUrls() {
	return baseUrls;
}
/**
 * 获取当前链接
 */
function getBaseUrl() {
	return baseUrl;
}
/**
 * 获取基础服务名
 */
function getBaseService() {
	return baseServiceName;
}

/**
 * 获取服务对象的WF-TAG
 * @param {Object} serviceName  服务名
 */
function getTag(serviceName) {
	return SERVICE_TAGS[serviceName] || '';
}
/**
 * 设置服务对象的WF-TAG
 * @param {Object}serviceName 服务名  
 */
function setTag(serviceName, tag = '') {
	if (SERVICE_TAGS[serviceName] !== tag) {
		SERVICE_TAGS[serviceName] = tag;
		storage.tem.setObj('__WF_SERVICE_TAGS', SERVICE_TAGS);
	}
	return SERVICE_TAGS[serviceName] = tag || '';
}
/**
 * 分隔host字符串
 * @param {Object} hostdesc 主机描述,多个使用,隔开
 */
function exchangeHostToHosts(hostdesc) {
	let _host = (hostdesc || '').split(',');
	return _host;
}

/**
 * 执行回调
 * @param {String} event
 * @param {Object} data
 */
function fireEvents(event, data) {
	let events = EVENTS[event];
	if (events && events.length > 0) {
		for (let item of events) {
			item(data);
		}
	}
}

//转换返回的数据值
function exchangeBackDataValues(data) {
	if (!data) {
		return data;
	}
	if (typeof data == 'string' && data.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}z$/gi)) {
		return new Date(data);
	}
	if (Array.isArray(data)) {
		let array = [];
		data.forEach(item => {
			array.push(exchangeBackDataValues(item));
		});
		return array;
	}
	if (!isPlainObject(data)) {
		return data;
	}
	let _data = {};
	for (let key in data) {
		let oldData = data[key];
		_data[key] = exchangeBackDataValues(data[key]);
	}
	return _data;
}

//转换返回的数据
function exchangeBackData(data, mode) {
	//数据转换
	data = exchangeBackDataValues(data);
	let globalMode = defalutResDataAttrNameStyle;
	let _mode = globalMode;
	if (mode >= 0 && mode <= 2) {
		_mode = mode;
	}
	return exchangeObjAttrNameLineToHump(data, _mode);
}

/**
 * 自定义处理全局异常响应码事件
 * @param {Object} eventName 事件名
 * @param {Object} matchedHandler 匹配函数，函数接受一个参数(错误码)，用于匹配，返回的结果应为true或false
 */
function customResErrorEvent(eventName, matchedHandler) {
	CUSTOMEVENTS.push({
		event: eventName,
		handler: matchedHandler
	});
}

/**协议前缀*/
function getProtocolPre(str = '') {
	return ((GLOBALCONFIG.protocolPre || 'WF') + '').toLowerCase() + str;
}
/**协议头前缀*/
function getProtocolHeaderPre(str = '') {
	return getProtocolPre('-').toUpperCase() + str;
}
/**响应前缀*/
function getProtocolResParams(str = '') {
	return getProtocolPre('_') + str;
}

/**
 * 循环使用baseUrl
 * @param {Object} baseUrl
 */
function recycleUrl(baseUrl) {
	let urls = getBaseUrls();
	//有1一个以上的url时有效
	if (urls.length < 2) {
		return baseUrl;
	}
	let curindex = urls.indexOf(baseUrl);
	let nextIndex = curindex + 1;
	if (nextIndex >= urls.length) {
		//一轮完成，从第一个开始
		nextIndex = 0;
	}
	let newurl = urls[nextIndex];
	saveBaseUrl(newurl);
	return newurl;
}
/**
 * 更新默认的基础浩云链接
 */
function updateBaseUrl(baseUrl) {
	if (!baseUrl) {
		return;
	}
	API_FAIL_RECORD[baseUrl] = Date.now();
	let mintime = 0;
	let fiturl = null;
	let urls = getBaseUrls();
	for (let url of urls) {
		let recordtime = API_FAIL_RECORD[url] || 0;
		if (!fiturl || mintime > recordtime) {
			fiturl = url;
			mintime = recordtime;
		}
	}
	//距离最旧切换的链接的时间较短时，基本说明全部链接都有问题，暂不切换
	if (Date.now() - mintime < 10 * 1000) {
		return;
	}
	saveBaseUrl(fiturl);
	return fiturl;
}

function saveBaseUrl(url) {
	baseUrl = url;
}

/**
 * @param {Object} obj是否文件类型对象（包括Blob和File类型）
 */
function isTypeFile(obj) {
	return isObjectTypeOf(obj, 'File') || isObjectTypeOf(obj, 'Blob');
}
/**
 * 是否文件集合
 * @param {Object} obj
 */
function isTypeFiles(obj) {
	return isObjectTypeOf(obj, 'FileList');
}
/**
 * 是否为指定类型的对象
 * @param {Object} obj
 * @param {Object} type
 */
function isObjectTypeOf(obj, type) {
	return null !== obj && typeof obj == 'object' && obj.constructor.name == type;
}
/**
 * @param {Object} obj 是否纯数据对象
 */
function isPlainObject(obj) {
	return Object.prototype.toString.call(obj).toLowerCase() == "[object object]" && !obj.length;
}
/**
 * 
 * @param {Object} data 按照递归的方式
 * 对属性值进行转换，File对象转base64字串，Date对象转ISO字串
 */
function exchangeFormValues(data) {
	if (data instanceof Date) {
		return data.toISOString();
	} else if (isPlainObject(data)) {
		for (let key in data) {
			let ret = exchangeFormValues(data[key]);
			data[key] = ret;
		}
	} else if (Array.isArray(data)) {
		for (let i = 0; i < data.length; i++) {
			let ret = exchangeFormValues(data[i]);
			data[i] = ret;
		}
	} else if (isTypeFiles(data)) {
		let list = [];
		for (let file of data) {
			let ret = exchangeFormValues(file);
			list.push(ret);
		}
		return list;
	}
	return data;
}

//驼峰转下划线
function humpToLine(name) {
	if (!name) {
		return name;
	}
	return name.replace(/([A-Z])/g, "_$1").toLowerCase();
}
//对象的属性名由驼峰转下划线
function exchangeObjAttrNameHumpToLine(params) {
	if (Array.isArray(params)) {
		let array = [];
		params.forEach(item => {
			array.push(exchangeObjAttrNameHumpToLine(item));
		});
		return array;
	}
	if (!isPlainObject(params)) {
		return params;
	}
	let _params = {};
	for (let key in params) {
		let _key = humpToLine(key);
		_params[_key] = exchangeObjAttrNameHumpToLine(params[key]);
	}
	return _params;
}
//下划线转驼峰
function lineToHub(name) {
	if (!name) {
		return name;
	}
	return name.replace(/\_([a-z])/g, (all, letter) => {
		return letter.toUpperCase();
	});
}
//对象的属性名由下划线转驼峰
function exchangeObjAttrNameLineToHump(params, mode) {
	if (!mode) {
		return params;
	}
	if (Array.isArray(params)) {
		let array = [];
		params.forEach(item => {
			array.push(exchangeObjAttrNameLineToHump(item, mode));
		});
		return array;
	}
	if (!isPlainObject(params)) {
		return params;
	}
	let _params = {};
	for (let key in params) {
		let _key = lineToHub(key);
		let oldData = params[key];
		_params[_key] = exchangeObjAttrNameLineToHump(params[key], mode);
		if (key == 2) {
			//兼容模式，保留原属性
			_params[key] = oldData;
		}
	}
	return _params;
}

function checkHost(url, existurls) {
	var reg = new RegExp(/^((\w+):)*\/\/([^/:]+)(:\d*)?(\/)*$/, 'g')
	if (!url || !url.match(reg)) {
		throw new Error('配置的域名：\n' + url + '\n无效,\n\n正确的域名格式示例：\nhttps://abc.cn\nhttps://abc.cn:8081\n//abc.cn:8088');
	}
	if (existurls.indexOf(url) != -1) {
		throw new Error('不能配置重复的域名：' + url);
	}
}

function checkServiceName(serviceName) {
	if (!serviceName) {
		return;
	}
	if (!serviceName.match(/^[\d|a-z|_]{1,}$/i)) {
		throw new Error('服务名称匹配字符为数字、字母、下划线');
	}
}

function removeLoginInfo() {
	cookie.remove('_WF_ACCESSID', '/');
	cookie.remove('_WF_ACCESSKEY', '/');
	cookie.remove('_WF_ACCESSEXPIRE', '/');
	cookie.remove('omni-ssss', '/');
	storage.tem.remove('__WF_LAST_LOGIN_TIME');
	storage.tem.remove('__WF_LAST_FIRE_OAUTH_TIME');
}

function onlogined(data, resove) {
	cookie.set('_WF_ACCESSID', data.accessId, 0, '/');
	cookie.set('_WF_ACCESSKEY', data.accessKey, 0, '/');
	cookie.set('_WF_ACCESSEXPIRE', data.accessExpire, 0, '/');
	if (data.sessionId) {
		cookie.set('omni-ssss', data.sessionId, 0, '/');
	}
	if (typeof resove == 'function') {
		resove(data);
	}
}

function fixAccessKeyToBase64(key) {
	if (!key) {
		return '';
	}
	if (key.length == 64) {
		//64长度的为16进制的
		return hexToBase64(key);
	} else {
		//其他的当做base64格式的
		return key;
	}
}
//刷新access
function refreshAccess() {
	const access_id = instance.getAccessId();
	const access_key = instance.getAccessKey();
	let url = GLOBALCONFIG['refreshAccessUrl'] || 'zuoche_user?method=refresh_access';
	return new Promise((resove, reject) => {
		noAccessPost(url, {
			access_id: access_id,
			access_key: access_key,
		}).then(data => {
			//刷新成功
			onlogined(data);
		}).catch(e => {
			//刷新失败，删掉过期时间
			cookie.remove('_WF_ACCESSEXPIRE', '/');
		});
	});
}

//定时器，检查检查是否需要更新access
setInterval(function() {
	let expire = cookie.get('_WF_ACCESSEXPIRE');
	if (!expire) {
		return;
	}
	if (Number(expire) - Date.now() < 5 * 60 * 1000) {
		//当有效期小于5分钟时刷新
		refreshAccess();
	}
}, 2 * 60 * 1000);

/**
 * 浩云服务数据请求接口（如果包含图片文件，一律转为base64字串）
 * @param {String} url 由域名（如果配置了baseUrl，域名可以省略）+服务名+'?'+参数键值对 例如：'http:192.168.0.44:6562/ias?method=accountinfo'
 * @param {Object} params {"param1": "value1",File:file,blob:Blod,fileList:FileList}
 * @param {Object} config 其他的配置项,浩云的常用配置放在config.wfconfig下，
 * wfconfig的常用属性：
 * resDataAttrNameStyle:Number类型,用于配置响应数据属性名的风格， 不指定时默认读取全局配置,指定时可选值有：0表示不转换，1表示下划线转驼峰，2、表示兼容默认，即转驼峰模式的同时保留原属性】
 * resDataMode:Number类型，不指定时默认读取全局配置，0，纯业务数据，1、包含code等信息的包装数据，注意：需要登录或者无访问权限时返回数据不受该参数控制,2，返回原始请求信息
 * reqDataAttrNameStyle:Number类型，用于配置请求数据属性名的风格，不指定时默认读取全局配置，0表示不作处理，1表示下划线装驼峰
 */
function post(url, params, config) {
	//请求数据前的监听事件触发
	fireEvents('beforerequest');
	let _config = extend(true, {}, config);
	let headers = extend(true, {}, _config.headers);
	//浩云层的配置
	let wfconfig = _config.wfconfig = extend(true, {
		url: url,
		//网关域名
		baseURL: getBaseUrl(),
		//返回数据模式
		resDataMode: -1,
		//返回数据属性名风格
		resDataAttrNameStyle: -1,
		//请输入数据属性名风格
		reqDataAttrNameStyle: -1,
		//自定义头
		headers: headers,
		//网关请求参数，可选
		wfReq: {
			resId: '',
			traceId: '',
			tenatId: '',
			ver: '',
			waitTimeout: -1
		},
		accessId: instance.getAccessId(),
		accessKey: instance.getAccessKey(),
	}, _config.wfconfig);
	_config.baseURL = wfconfig.baseURL;
	if (!_config.baseURL) {
		throw new Error('参数异常：未指定网关域名');
	}
	let accessId = wfconfig.accessId;
	let accessKey = fixAccessKeyToBase64(wfconfig.accessKey);
	//值转换
	let _params = exchangeFormValues(extend(true, {}, params));
	//全局参数
	_params._global = extend(true, {}, GLOBAL, _params._global);
	let _global = exchangeFormValues(_params._global);
	_params._global = _global;

	let splitIndex = url.indexOf('?');
	let baseService = getBaseService();
	if (SERVICENAMEMAP && SERVICENAMEMAP[baseService]) {
		baseService = SERVICENAMEMAP[baseService];
	}
	let _url = baseService;
	let wfextparams = '';
	let _pms = {
		method: ''
	};
	if (-1 !== splitIndex) {
		_url = url.substring(0, splitIndex) || baseService;
		if (SERVICENAMEMAP && SERVICENAMEMAP[_url]) {
			_url = SERVICENAMEMAP[_url];
		}
		wfextparams = url.substring(splitIndex + 1, url.length);
		for (let item of wfextparams.split('&')) {
			let keyvalue = item.split('=');
			_pms[keyvalue[0]] = keyvalue[1] || '';
		}
	}
	let serviceName = _url;
	if (!serviceName) {
		throw new Error('参数异常：未指定请求服务名');
	}

	if (_pms.method) {
		_pms.method = humpToLine(_pms.method);
	} else {
		throw new Error('参数异常：未指定请求方法名');
	}

	let wfReq = {
		//微服务版本
		ver: SERVICE_VERSIONS[serviceName] || '',
		traceId: '',
		resId: '',
		waitTimeout: -1
	};
	if (wfconfig.wfReq) {
		wfReq = extend(true, wfReq, wfconfig.wfReq);
	}
	wfReq = exchangeFormValues(wfReq);
	let waitTimeout = wfReq['waitTimeout'];
	if (typeof waitTimeout != 'number' || waitTimeout <= 0) {
		waitTimeout = GLOBALCONFIG['waitTimeout'] || 0;
	}
	if (typeof waitTimeout == 'number' && waitTimeout > 0) {
		wfReq['waitTimeout'] = waitTimeout;
		_config.timeout = waitTimeout * 1000;
	} else {
		delete wfReq['waitTimeout'];
	}
	let wfReqName = getProtocolPre('Req');
	_params = {
		[wfReqName]: wfReq,
		invoke: extend(_pms, {
			//业务层参数
			params: _params,
		})
	};
	//属性名转换
	let reqDataAttrNameStyle = wfconfig.reqDataAttrNameStyle;
	if (reqDataAttrNameStyle == -1) {
		reqDataAttrNameStyle = defalutReqDataAttrNameStyle;
	}
	if (reqDataAttrNameStyle === 1) {
		//请求参数转驼峰模式
		_params = exchangeObjAttrNameHumpToLine(_params);
	}
	let wftag = headers[getProtocolHeaderPre('Tag')] || getTag(serviceName);
	headers[getProtocolHeaderPre('Tag')] = wftag;
	if (accessId && accessKey && wfconfig.ignoreauth !== true && wfconfig.withoutaccessid != true) {
		//唯一字串
		let wfnoise = Number(Date.now() + (++requestCounter)).toString(16);
		let content = JSON.stringify(_params);
		//签名：参数内容+唯一字串+鉴权账号
		let wfContentSign = new sha256().update(content).digestBase64();
		headers[getProtocolHeaderPre('Content-Sign')] = wfContentSign;
		let signDataStr = serviceName + accessId + accessKey + wfnoise + wftag + wfContentSign;
		let sign = new sha256().update(signDataStr).digestBase64();
		headers['Authorization'] = getProtocolHeaderPre('SHA2') + ' ' + accessId + ':' + sign;
		headers[getProtocolHeaderPre('Noise')] = wfnoise;
	} else {
		headers['Authorization'] = getProtocolHeaderPre('None');
	}
	_config.headers = headers;
	return axios.post(_url, _params, _config);
}
/**
 * 无Acesses请求数据，用法同post，默认忽略access获取数据
 * @param {Object} url 请求链接
 * @param {Object} params 请求参数
 * @param {Object} config 请求配置
 */
function noAccessPost(url, params, config) {
	let _config = extend(true, {
		wfconfig: NOAUTHDEFCONFIG
	}, config);
	return post(url, params, _config);
}

/**
 * 配置全局参数
 * @param {String} key 参数名
 * @param {String,Number,Boolean} value 参数值 
 */
function putGlobalParam(key, value) {
	if (value == null || value === undefined) {
		value = '';
	}
	if (typeof key != 'string' || !key) {
		throw new Error('key:' + key + '必须为非空字串');
	}
	if (typeof value == 'string' || typeof value == 'number' || typeof value == 'boolean') {
		GLOBAL[key] = value;
	} else {
		throw new Error('value可选类型为String,Number,Boolean');
	}
}
/**
 * 获取全局参数值
 * @param {String} key
 */
function getGlobalParam(key) {
	return GLOBAL[key];
}
/**
 * 删除全局参数值
 * @param {String} key
 */
function removeGlobalParam(key) {
	delete GLOBAL[key];
}

//返回的异常数据统一处理
axios.interceptors.response.use(res => {
	let data = res.data;
	if (!data) {
		return res;
	}
	//来自weforward的数据
	let reqwfconfig = res.config.wfconfig;
	if (reqwfconfig) {
		let resDataMode = reqwfconfig.resDataMode;
		if (resDataMode == -1) {
			resDataMode = defalutResDataMode;
		}
		//返回原始结果
		if (resDataMode == 2) {
			return res;
		}
		let serviceName = reqwfconfig.url.split('?')[0] || getBaseService();
		if (SERVICENAMEMAP && SERVICENAMEMAP[serviceName]) {
			serviceName = SERVICENAMEMAP[serviceName];
		}
		let wftag = res.headers[getProtocolHeaderPre('Tag').toLowerCase()] || '';
		setTag(serviceName, wftag);
		if (ISRECYCLEURLS) {
			//轮流切换url
			recycleUrl(getBaseUrl());
		}
		let resDataAttrNameStyle = reqwfconfig.resDataAttrNameStyle;
		if (resDataAttrNameStyle == -1) {
			resDataAttrNameStyle = defalutResDataAttrNameStyle;
		}
		let loginErrorMsg = GLOBALCONFIG['loginErrorMsg'];
		//浩云层异常码处理
		let wfresp = data[getProtocolResParams('resp')];
		let wfcode = wfresp[getProtocolResParams('code')];
		if (wfcode !== 0) {
			let errorMsg = wfresp[getProtocolResParams('msg')];
			if ([1001, 1002, 1501].indexOf(wfcode) != -1) {
				if (wfcode == 1501 && !!reqwfconfig.accessId) {
					//有登陆过但是无法调用，提示无访问权限
					fireEvents('visitforbidden', data.result);
					throw new Error(errorMsg);
				}
				let isNeedLogin = true;
				if ((wfcode == 1001 || wfcode == 1002) && !!reqwfconfig.accessId) {
					let logincounter = Number(storage.tem.get('__WF_LAST_LOGIN_TIME') || 0);
					//短时间登录过一次了，直接抛错
					if (Date.now() - logincounter < 3000) {
						isNeedLogin = false;
					}
				}
				if (isNeedLogin) {
					//需要验证登录
					if (loginErrorMsg) {
						errorMsg = loginErrorMsg;
					}
					removeLoginInfo();
					fireEvents('requireauth', errorMsg);
				}
			}
			throw new Error(errorMsg);
		}
		//上传或者下载业务处理
		if (wfresp.res_url) {
			return exchangeBackData(data, resDataAttrNameStyle);
		}
		//业务层异常码处理
		let result = data.result;
		let code = result.code;
		if (code !== 0) {
			let haslogininfo = !!reqwfconfig.accessId;
			if ([10002, 10003].indexOf(code) != -1) {
				let errorMsg = result.msg;
				if (code == 10002 && haslogininfo) {
					//有登陆过但是无法调用，提示无访问权限
					fireEvents('visitforbidden', result);
					throw new Error(errorMsg);
				}
				let isNeedLogin = true;
				if (code == 10003 && haslogininfo) {
					let logincounter = Number(storage.tem.get('__WF_LAST_LOGIN_TIME') || 0);
					//短时间内登录过一次了，直接抛错
					if (Date.now() - logincounter < 3000) {
						isNeedLogin = false;
					}
				}
				if (isNeedLogin) {
					//需要验证登录
					if (loginErrorMsg) {
						errorMsg = loginErrorMsg;
					}
					removeLoginInfo();
					fireEvents('requireauth', errorMsg);
				}
				throw new Error(errorMsg);
			}
			//自定义错误码拦截
			for (let item of CUSTOMEVENTS) {
				if (item.handler(code)) {
					fireEvents(item.event, result);
					throw new Error(result.msg);
				}
			}
			if (resDataMode == 1) {
				return exchangeBackData(result, resDataAttrNameStyle);
			} else {
				throw new Error(result.msg);
			}
		}
		let returnret = resDataMode == 1 ? result : result.content;
		return exchangeBackData(returnret, resDataAttrNameStyle);
	}
	//非浩宁云的服务请求直接返回业务数据
	return data;
}, err => {
	if (err && err.config && err.config.wfconfig && err.request) {
		//浩云异常处理，负载均衡实现
		let axioscfg = err.config;
		let reqcode = err.request.readyState || -1;
		let res = err.response;
		let rescode = res ? res.status : 0;
		let wfcfg = axioscfg.wfconfig;
		//开启切换url并且，不是每次请求都指定baseURL的情况下，执行轮流切换url
		if (!ISRECYCLEURLS && !wfcfg.baseURL) {
			if (rescode >= 500 || (!res && reqcode >= 0)) {
				let baseUrl = getBaseUrl();
				let newbaseUrl = updateBaseUrl(baseUrl);
				if (newbaseUrl) {
					wfcfg.retryedcount = wfcfg.retryedcount || 0;
					if (wfcfg.retryable === true || wfcfg.retryedcount < _maxretrycount) {
						let _reqparams = JSON.parse(axioscfg.data).invoke.params;
						let _wfcfg = extend(true, {}, wfcfg);
						_wfcfg.retryedcount++;
						return post(wfcfg.url, _reqparams, {
							wfconfig: _wfcfg
						});
					}
				}
			}
		}
	}
	throw err;
});

function WeforwradProtocol() {

}
let instance;
/**
 * 对外提供的方法
 */
WeforwradProtocol.prototype = {
	/**
	 * 是否已登录
	 */
	isLogined() {
		return cookie.get('_WF_ACCESSID') && cookie.get('_WF_ACCESSKEY');
	},
	/**
	 * 获取鉴权id
	 */
	getAccessId() {
		return cookie.get('_WF_ACCESSID');
	},
	/**
	 * 获取鉴权key
	 */
	getAccessKey() {
		return cookie.get('_WF_ACCESSKEY');
	},

	/**
	 * 设置浩云数据请求异常（非业务异常，例如：网络链接错误或者，response的status为500,502,503,504之类的）时,单个请求可重试的次数
	 * 【注意：仅当配置了多个可选的浩云接口域名，并且距离最久没有调用过的域名的时间超过了10秒时才生效】
	 * @param {Number} count 可选数值0~3,默认1
	 */
	setMaxRetryCount(count) {
		if (typeof count == 'number' && count >= 0 && count <= 3) {
			_maxretrycount = count;
		} else {
			throw new Error('可重试次数值应为为0-3之间（包含）的数字');
		}
	},
	/**
	 * 配置生产服务请求域名（请求服务的urls）【优先级高于通过wfconfig.json的配置】
	 * @param {String} urls 支持多个参数url用于负载均衡
	 */
	setBaseHosts,
	/**
	 * 配置基础服务名称【优先级高于通过wfconfig.json的配置】
	 * @param {String} serverName
	 */
	setBaseService,

	//原始的axios，可用于普通的数据请求
	axios: axios,

	/**
	 * 
	 * @param {Object} data 按照递归的方式
	 * 对属性值进行转换，File对象转base64字串，Date对象转ISO字串
	 */
	exchangeFormValues,
	/**
	 * 浩云服务数据请求接口（如果包含图片文件，一律转为base64字串）
	 * @param {String} url 由域名（如果配置了baseUrl，域名可以省略）+服务名+'?'+参数键值对 例如：'http:192.168.0.44:6562/ias?method=accountinfo'
	 * @param {Object} params {"param1": "value1",File:file,blob:Blod,fileList:FileList}
	 * @param {Object} config 其他的配置项,浩云的常用配置放在config.wfconfig下，
	 * wfconfig的常用属性：
	 * resDataAttrNameStyle:Number类型,用于配置响应数据属性名的风格， 不指定时默认读取全局配置,指定时可选值有：0表示不转换，1表示下划线转驼峰，2、表示兼容默认，即转驼峰模式的同时保留原属性】
	 * resDataMode:Number类型，不指定时默认读取全局配置，0，纯业务数据，1、包含code等信息的包装数据，注意：需要登录或者无访问权限时返回数据不受该参数控制,2，返回原始请求信息
	 * reqDataAttrNameStyle:Number类型，用于配置请求数据属性名的风格，不指定时默认读取全局配置，0表示不作处理，1表示下划线装驼峰
	 */
	post,

	/**
	 * 无Acesses请求数据，用法同post，默认忽略access获取数据
	 * @param {Object} url 请求链接
	 * @param {Object} params 请求参数
	 * @param {Object} config 请求配置
	 */
	noAccessPost,
	/**
	 * @param {Object} url 请求上传的微服务所需要url
	 * @param {Object} params 请求上传的微服务所需要的参数
	 * @param {Object} file 需要上传文件,file必须为是Blob或File对象,每次只能上传一个
	 * @param {Object} config，如果配置了wfconfig,resDataAttrNameStyle此处配置不生效，强制驼峰模式
	 * 关于监听上传进度的配置,请配置wfconfig的onUploadProgress属性：function(e){
		 
	 }
	 * {wfconfig:{onUploadProgress:onUploadProgress}}
	 * 
	 */
	upload(url, params, file, config) {
		if (!file) {
			throw new Error('参数异常：未指定要上传的文件‘file’');
		}
		if (!isTypeFile(file)) {
			throw new Error('参数异常：file必须为是Blob或File对象');
		}
		let _config = extend(true, config, {
			wfconfig: {
				//返回数据强制下划线转驼峰
				resDataAttrNameStyle: 1,
			},
		});
		return new Promise((resoved, reject) => {
			let backData = null;
			post(url, params, _config).then(data => {
				//处理返回的数据
				let resDataMode = _config.wfconfig.resDataMode === undefined ? -1 : _config.wfconfig
					.resDataMode;
				if (resDataMode == -1) {
					resDataMode = defalutResDataMode;
				}
				if (resDataMode == 1) {
					backData = data.result;
				} else {
					backData = data.result.content;
				}
				let wfresp = data[getProtocolPre('Resp')];
				if (!wfresp.resUrl) {
					reject({
						message: '上传异常：未返回上传通道',
						data: backData
					});
					return;
				}
				let fileFormData = new FormData();
				fileFormData.append('file', file);
				return axios.post(wfresp.resUrl, fileFormData, {
					onUploadProgress: _config.wfconfig.onUploadProgress
				});
			}).then(data => {
				let resData = data.request ? data.data : data;
				if (resData && resData.code != 0) {
					reject({
						message: resData.msg || resData || '上传失败',
						data: backData
					});
					return;
				}
				resoved(backData);
			}).catch(e => {
				if (backData) {
					reject({
						message: e.message,
						data: backData
					});
					return;
				}
				reject(e);
			});
		});
	},
	/**
	 * @param {Object} url 请求下载的微服务所需要url
	 * @param {Object} params 请求下载的微服务所需要的参数
	 * @param {Object} config 如果配置了wfconfig,resDataAttrNameStyle此处配置不生效，强制驼峰模式,
	 * 下载接口的wfconfig配置，此处新增一个notAutoDownload属性用于配置是否不自动打开连接Boolean类型，默认为false,也就是默认自动打开，特殊情况可能不需要自动打开，例如上传文件后
	 */
	download(url, params, config) {
		let _config = extend(true, config, {
			wfconfig: {
				resDataAttrNameStyle: 1
			}
		});
		return new Promise((resoved, reject) => {
			post(url, params, _config).then(data => {
				let wfresp = data[getProtocolPre('Resp')];
				if (!wfresp.resUrl) {
					reject(new Error('下载异常：未返回下载通道'));
				}
				resoved(data);
				if (!_config.wfconfig.notAutoDownload) {
					location.href = wfresp.resUrl;
				}
			}).catch(e => {
				reject(e);
			});
		});
	},
	/**
	 * 浩云统一登录
	 * @param {String} username 用户名
	 * @param {String} password 密码
	 * @return {Promise}
	 */
	login(username, password) {
		return new Promise((resove, reject) => {
			let url = GLOBALCONFIG['loginUrl'] || 'zuoche_user?method=login';
			noAccessPost(url, {
				userName: username,
				password: password,
			}).then(data => {
				if (data.accessId && data.accessKey) {
					onlogined(data, resove);
					return;
				}
				reject(new Error('登录异常：' + JSON.stringify(data)));
			}).catch(e => {
				reject(e);
			});
		});
	},
	/**
	 * 穿越登录功能
	 * @param {String} username 穿越用户名
	 * @param {String} password 穿越用户密码
	 * @param {String} suloginname 被穿越者登录名
	 */
	su(username, password, suloginname) {
		return new Promise((resove, reject) => {
			let url = GLOBALCONFIG['loginUrl'] || 'zuoche_user?method=login';
			noAccessPost(url, {
				userName: username,
				password: password,
			}).then(data => {
				let suurl = GLOBALCONFIG['suUrl'] || 'zuoche_user?method=su';
				return noAccessPost(suurl, {
					userName: suloginname,
					suId: data.sessionId
				});
			}).then(data => {
				if (data.accessId && data.accessKey) {
					onlogined(data, resove);
					return;
				}
				reject(new Error('登录异常：' + JSON.stringify(data)));
			}).catch(e => {
				reject(e);
			});
		});
	},
	//退出登录，不会有失败的情况
	logout() {
		let promise = new Promise((resove, reject) => {
			let url = GLOBALCONFIG['logoutUrl'] || 'zuoche_user?method=logout';
			post(url).finally(() => {
				removeLoginInfo();
				resove();
			})
		});
		return promise;
	},
	/**
	 * 添加浩宁云请求事件监听
	 * @param {String} event 监听的事件名，可选事件:requireauth--表示需要登录监听事件,visitforbidden--表示无访问权限监听事件,beforerequest--表示请求数据前的时间
	 * @param {Function} handler
	 */
	addEventListener(event, handler) {
		if (!event) {
			return;
		}
		if (typeof handler != 'function') {
			return;
		}
		let events = EVENTS[event];
		if (!events) {
			EVENTS[event] = [];
		} else if (EVENTS[event].indexOf(handler) !== -1) {
			//不允许有重复的
			return;
		}
		EVENTS[event].push(handler);
	},
	/**
	 * 移除请求异常的事件监听
	 * @param {String} event 事件名称
	 * @param {Function} handler 待移除的监听事件，不指定时移除全部监听
	 */
	removeEventListener(event, handler) {
		if (!event) {
			return;
		}
		let events = EVENTS[event];
		if (!handler) {
			delete EVENTS[event];
			return;
		}
		let index = -1;
		if (events && (index == events.indexOf(handler) != -1)) {
			events.splice(index, 1);
		}
	},
	/**
	 * 移除全部监听
	 */
	removeAllEventListener() {
		for (let key in EVENTS) {
			delete EVENTS[key];
		}
	},
	/**
	 * 配置微服务版本
	 * @param {String} serviceName 正式环境服务名
	 * @param {String} version 大版本号例如：1.0，不配置默认为最新版
	 */
	setServiceVersion: function(serviceName, version) {
		if (!serviceName) {
			return;
		}
		if (version) {
			SERVICE_VERSIONS[serviceName] = version;
		} else {
			delete SERVICE_VERSIONS[serviceName];
		}
	},
	/**
	 * 更新全局属性
	 * @param {String} name 可以选的全局属性名
	 * 
	 * resDataMode:默认0，0:纯业务数据，1:包含code等信息的包装数据(需要登录或者无访问权限时不受该参数控制),2、表示返回原始请求数据，此时不针对数据做任何加工处理
	 * resDataAttrNameStyle: 返回数据属性名转换模式，默认1,0:不转换，1、下划线转驼峰，2、兼容默认，转驼峰的同时保留原属性
	 * reqDataAttrNameStyle:Number类型，用于配置请求数据属性名的风格，不指定时默认读取全局配置，0表示不作处理，1表示下划线转驼峰
	 * loginErrorMsg:String类型，用于配置需要登录的提示
	 * loginUrl:String类型，用于配置需要自定义登录的url
	 * logoutUrl:String类型，用于配置需要自定义退出登录的url
	 * suUrl:String类型，模拟登陆 url
	 * waitTimeout:Number网关超时时间 单位秒
	 * protocolPre:String 协议头
	 * 
	 */
	updateGlobalConfig: function(name, value) {
		if (name == 'resDataMode') {
			let val = Number(value);
			if (typeof value != 'number' || (val < 0 || val > 2)) {
				throw new Error(name + '的可选数值为0~2');
			}
			defalutResDataMode = val;
			return;
		}
		if (name == 'resDataAttrNameStyle') {
			let val = Number(value);
			if (typeof value != 'number' || (val < 0 || val > 2)) {
				throw new Error(name + '的可选数值为0~2');
			}
			defalutResDataAttrNameStyle = val;
			return;
		}
		if (name == 'reqDataAttrNameStyle') {
			let val = Number(value);
			if (typeof value != 'number' || (val !== 0 && val !== 1)) {
				throw new Error(name + '的可选数值为0~2');
			}
			defalutReqDataAttrNameStyle = val;
			return;
		}
		GLOBALCONFIG[name] = value;
	},
	/**
	 * 配置全局参数
	 * @param {String} key 参数名
	 * @param {String,Number,Boolean} value 参数值 
	 */
	putGlobalParam,
	/**
	 * 获取全局参数值
	 * @param {String} key
	 */
	getGlobalParam,
	/**
	 * 删除全局参数值
	 * @param {String} key
	 */
	removeGlobalParam,
	//自定义全局响应错误码拦截事件
	customResErrorEvent,
	//保存登录信息（内部或插件使用）
	onlogined,
	//获得编译版本信息
	getBuildInfo() {
		return extend(true, {
			version: '',
			buildTime: '',
			buildType: '',
			buildPluginName: ''
		}, window._WEFORWARD_VERSION);
	},
	//获取当前的基础url
	getBaseUrl
};
instance = new WeforwradProtocol();
export default instance;
