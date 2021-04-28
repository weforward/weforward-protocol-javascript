export default {
	set: function(key, value, expiresMillis, path) {
		var ck = key + '=' + escape(value);
		// 判断是否设置过期时间
		var date = new Date();
		if (expiresMillis) {
			date.setTime(date.getTime() + expiresMillis);
			ck = ck + ';expires=' + date.toGMTString();
		}
		ck = ck + ';path=' + (path || '');
		document.cookie = ck;
	},
	get: function(key) {
		var array = document.cookie.split(';');
		for (var i = 0; i < array.length; i++) {
			var arr = array[i].split('=');
			if (String(arr[0]).trim() == key) {
				return unescape(arr[1]);
			}
		}
		return '';
	},
	/**
	 * 移除cookie
	 * 例如：Cookie.remove('key','path=/');
	 * key:键
	 * path:路径【可选】
	 */
	remove: function(key, path) {
		var date = new Date();
		date.setDate(date.getDate() - 1);
		document.cookie = key + '=;expires=' + date.toGMTString() + ';path=' + (path || '');
	},
	/**
	 * 删除指定路径的的cookie
	 * path:路径【可选，默认当前路径】
	 */
	clear: function(path) {
		var date = new Date();
		date.setDate(date.getDate() - 1);
		var ex = date.toGMTString();
		var keys = document.cookie.match(/[^ =;]+(?=\=)/g);
		if (keys) {
			keys.forEach((item) => {
				var ck = item + '=;expires=' + ex;
				if (path) {
					ck += ';path=' + (path || '');
				}
				document.cookie = ck;
			});
		}
	},
	//删除当前可访问的所有cookie
	clearAll: function() {
		var path = location.pathname;
		var idx = -1;
		while ((idx = path.lastIndexOf('/')) != -1) {
			path = path.substring(0, idx + 1);
			this.clear(path);
			path = path.substring(0, idx);
			this.clear(path);
		}
	}
}
