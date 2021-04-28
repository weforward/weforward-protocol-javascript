import extend from './es6extend.js'
let _space;

let apis = {
	set(key, value) {
		this.storage.setItem(this.getKey(key), value);
	},
	get(key) {
		return this.storage.getItem(this.getKey(key));
	},
	remove(key) {
		this.storage.removeItem(this.getKey(key))
	},
	clear() {
		this.storage.clear();
	},
	setObj(key, obj) {
		this.storage.setItem(this.getKey(key), JSON.stringify(obj));
	},
	getObj(key) {
		var val = this.storage.getItem(this.getKey(key));
		if (val) {
			return JSON.parse(val);
		}
		return val;
	},
	getKey(key) {
		if (this.pre) {
			return this.pre + key;
		}
		return key;
	}
};
let exports = {
	//普通存储
	storage: window.localStorage,
	//会话存储
	tem: {
		storage: window.sessionStorage
	},
	//具备命名空间的存储
};
[exports, exports.tem].forEach(item => {
	extend(item, apis);
});
export default exports;
