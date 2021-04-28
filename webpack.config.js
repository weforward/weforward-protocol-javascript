let path = require("path");
module.exports = {
	entry: [ /* 'babel-polyfill', */ path.join(__dirname, 'index.js')],
	devtool: 'inline-source-map',
	devServer: {
		contentBase: './dist'
	},
	output: {
		libraryExport: 'default',
		path: path.join(__dirname, './dist/'),
		filename: 'weforward-protocol.js',
		libraryTarget: 'umd',
		library: 'wf',
	},
	mode: "production", // 告诉webpack使用production模式的内置优化,
	module: {
		rules: [{
			test: /\.js$/,
			use: {
				loader: "babel-loader",
				options: {
					presets: [
						"@babel/env"
					]
				}
			},
			exclude: path.resolve(__dirname, "node_modules"),
			include: path.resolve(__dirname, "lib")
		}]
	}
}
