function isObject(obj) {
	return ['[object Array]', '[object Object]'].indexOf(Object.prototype.toString.call(obj)) != -1;
}
export default function extend() {
	var target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false,
		options;
	if (typeof target === "boolean") {
		deep = target;
		target = arguments[1] || {};
		i = 2;
	}
	if (typeof target !== "object" && typeof target != 'function') {
		target = {};
	}
	if (length == i) {
		target = this;
		--i;
	}
	for (; i < length; i++)
		if ((options = arguments[i]) != null)
			for (var name in options) {
				var src = target[name],
					copy = options[name];
				if (target === copy) {
					continue;
				}
				if (deep && copy && isObject(copy) && !copy.nodeType) {
					target[name] = extend(deep, src || (copy.length != null ? [] : {}), copy);
				} else if (copy !== undefined) {
					target[name] = copy;
				}
			}
	return target;
}
