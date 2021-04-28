# weforward-protocol
weforward数据请求包装，数据请求部分用的axios，因此wf.axios可以用于普通的请求

请求weforward数据时的参数和配置部分基本和axios一致


## 安装

```js
npm install weforward-protocol
```

引入
```js
import wf from 'weforward-protocol'
```

```bash
#配置环境变量，以vue cli3.x为例，在项目根目录创建.env文件

#接口域名，多个时使用英文逗号隔开
VUE_APP_WF_HOST=https://g1.weforward.cn,https://z1.weforward.cn

```


## 普通数据请求

```js
//有登录的情况下,Authorization使用WF-SHA2，否则Authorization使用WF-None
/**
 * @param {Object} url 请求链接
 * @param {Object} params 请求参数
 * @param {Object} config 请求配置
 */
wf.post('serviceName?method=methodName',{param1:'test'},config);
//params和config为可选参数

//用法同wf.post,但该方法Authorization强制使用WF-None，适用于不需要access凭证的请求，例如登录
wf.noAccessPost('serviceName?method=methodName',{param1:'test'},config);
```


```js
/**示例说明
普通数据请求使用wf.post方法（文件上传和文件下载除外，后面会有介绍）
url部分说明：
train表示微服务名，如果有指定默认微服务名此处可以省略，
method后面的listGoods表示微服务的方法名,params表示请求的参数,
config请参考axios的参数配置，需要注意的是，
config中提供一个weForward请求专用的属性wfconfig
{
	wfconfig:{
		//网关域名
		baseURL: '',
		//resDataMode 用于配置返回数据模式 Number类型
		//不指定时默认-1，读取全局配置，注意：需要登录或者无访问权限时返回数据不受该参数控制
		0、纯业务层数据，
		1、包含code等状态的业务数据
		2、返回原始请求信息
		resDataMode: -1,
		//自定义头
		headers: {},
		//网关请求参数，可选
		// {
		// 	resId:'',
		// 	traceId:'',
		// 	tenatId:'',
		// 	ver:'',
		// 	waitTimeout:0
		// }
		wfReq: null,
		accessId: '',
		accessKey: '',
	}
}
*/
let params={params1:'params1'};
wf.post('train?method=listGoods',{params1:'params1'})
  .then(function (data) {
    console.log(data);
  })
  .catch(function (error) {
    console.log(error);
  });
```

## 文件上传
```js
	//用法
	/**
	 * @param {Object} url 请求上传的微服务所需要url，参数要求和post方法的一致
	 * @param {Object} params 请求上传的微服务所需要的参数，可为空
	 * @param {Object} file 需要上传的文件,file必须为是Blob或File对象,每次只能上传一个
	 * @param {Object} config，可以选
	 * 如需监听上传进度,请配置wfconfig的onUploadProgress属性：function(e){
	 }
	 * {wfconfig:{onUploadProgress:onUploadProgress}}
	 * 
	 */
	upload(url, params, file, config) ;

```

```js
//示例
wf.upload('serviceName?method=method', {}, file, {
		wfconfig: {
			onUploadProgress: e => {
				let percent = (e.loaded / e.total) * 100;
				console.log(percent);
			}
		}
	})
	.then(data => {
		console.log('upload success')
	});
}).catch(e = {
	console.log(e);
})
```


## 文件下载

```js
	/**
	 * @param {Object} url 请求下载的微服务所需要url，参数要求和post方法的一致
	 * @param {Object} params 请求下载的微服务所需要的参数，可选
	 * @param {Object} config，可选
	 * config下的wfconfig此处支持notAutoDownload属性，用于配置是否不自动打开连接Boolean类型
	 * 默认为false,也就是默认自动打开，特殊情况可能不需要自动打开，例如上传文件后
	 */
	wf.download(url, params, config)
```

## 统一登录
初始化应用时需要配置好全局的loginUrl

```js
	wf.updateGlobalConfig('loginUrl','serviceName?method=method');
```

```js
	/**
	 * 统一登录
	 * @param {String} username 用户名
	 * @param {String} password 密码
	 * @return {Promise}
	 */
	wf.login(username, password).then(data=>{
		
	}).catch(e=>{
		
	});
```


【注意】：如果需要自定义登录的参数，可以使用wf.noAccessPost方法，
登录成功后，调用wf.onlogined(data)
```js
	//例如：自定义实现登录，返回的数据，必须要包含accessId，accessKey，accessExpire三个属性
	wf.noAccessPost('url',{'params1':'value1'}).done(data=>{
		wf.onlogined({
				accessId:data.accessId,
				accessKey:data.accessKey,
				//凭证过期时间
				accessExpire:data.accessExpire
		});
	});
```

## 退出登录

初始化应用时需要配置好全局的logoutUrl
```js
	wf.updateGlobalConfig('logoutUrl','serviceName?method=method');
```
调用退出登录
```js
	/**
	 * 统一退出登录
	 * @return {Promise}
	 */
	wf.logout().then(data=>{
		
	}).catch(e=>{
		
	});
```

登录后的凭证是有有效期的，为了维持有效性，内部会定时刷新延长有效期，
因此初始化应用的时候需要全局配置refreshAccessUrl
```js
	//示例：
	wf.updateGlobalConfig('refreshAccessUrl','zuoche_user?method=refresh_access')
```



## 添加请求异常监听

```js
	/**
	 * 添加请求事件监听
	 * @param {String} event 监听的事件名，
	 * 可选事件:
	 * requireauth--表示需要登录监听事件,
	 * visitforbidden--表示无访问权限监听事件,
	 * beforerequest--表示请求数据前的事件
	 * @param {Function} handler
	 */
	wf.addEventListener(event, handler);
	
	//一般是在初始初始化项目的时候配置好
	
	//监听需要登录事件
	wf.addEventListener('requireauth', ()=>{
		//TODO 展示登录视图
	});
	//无访问权限监听
	wf.addEventListener('visitforbidden', ()=>{
		//TODO 展示无访问全新视图
	});
	
	//甚至还可以自定义业务层异常事件监听,例如：
	//后台和前端约定好业务层错误码
	const VERIFYMOBILECODE = 100000101;
	//注册自定义异常码匹配
	wf.customResErrorEvent('verifymobile', code => VERIFYMOBILECODE === code);
	//添加自定义异常事件监听
	wf.addEventListener('verifymobile', () => {
		//TODO
	});
		
```

## 配置基础服务名

```js
	//基础服务名也就是默认微服务名
	//如果你认为该服务使用的次数最多，便可以配置该项
	/**
	 * 添加请求事件监听
	 * @param {String} serviceName 配置一个基础服务名
	 */
	wf.setBaseService(serviceName)；
	
	
	//这样请求的时候可以省略掉服务名
	
	例如:
	wf.post('?method=methodName');
	
	//每一对使用英文冒号隔开，配置多对时使用英文逗号隔开，如果生产环境的和自己的相同也可以简写，例如
	//例如多人协同开发，各自有不同的服务器时，需要用到
	VUE_APP_DEV_SERVICENAME=train:traintest,demo:demotest
```
## 配置全局参数

```js
	/**
	 * 如果一个参数，每个请求都需要带上，那么可以放在全局请求参数中
	 * @param {String} key 参数名
	 * @param {String,Number,Boolean} value 参数值
	 */
	wf.putGlobalParam(key, value);
	
	//这样请求的时候可以省略掉服务名
	
	例如:
	wf.putGlobalParam('name', '张三');
	
	另外还有：
	wf.getGlobalParam(key);//获取全局参数
	wf.removeGlobalParam(key);//删除全局参数
	
```

版本说明：accesskey同时支持hex和base64格式