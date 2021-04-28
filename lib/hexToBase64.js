const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export default function(hexstr) {
	let base64Array = [];
	let cnt = 0;
	let bitArr = 0;
	let bitNum = 0;
	let ascv;
	for (let n = 0; n < hexstr.length; ++n) {
		if (hexstr[n] >= 'A' && hexstr[n] <= 'Z') {
			ascv = hexstr.charCodeAt(n) - 55;
		} else if (hexstr[n] >= 'a' && hexstr[n] <= 'z') {
			ascv = hexstr.charCodeAt(n) - 87;
		} else {
			ascv = hexstr.charCodeAt(n) - 48;
		}
		bitArr = (bitArr << 4) | ascv;
		bitNum += 4;
		if (bitNum >= 6) {
			bitNum -= 6;
			base64Array.push(digits[bitArr >>> bitNum]);
			bitArr &= ~(-1 << bitNum);
		}
	}
	if (bitNum > 0) {
		bitArr <<= 6 - bitNum;
		base64Array.push(digits[bitArr]);
	}
	let padding = base64Array.length % 4;

	if (padding > 0) {
		for (let n = 0; n < 4 - padding; ++n) {
			base64Array.push('=');
		}
	}
	return base64Array.join('');
}
