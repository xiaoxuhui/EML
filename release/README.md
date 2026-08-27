# EML 发布包

本目录包含可直接分发的单文件发布包。

## EML-v1.1.0.zip（当前版本）

由 `v1.1.0` 标签对应的源代码构建（`dist/eml-workbench.html`）。解压后双击 `eml-workbench.html` 即可运行，不需要安装依赖或启动服务器。

- 文件大小：92,186 字节
- SHA-256：`84e0573a8d76ab0acec97fc9821d2fdce300f3539bfd94aa33414af4d98bbe50`
- 内容：`eml-workbench.html`、`README.txt`

## EML-v1.0.0.zip（历史版本）

初版的旧单文件原型（内联模块命名与 `dist/` 的模块化构建不同，不含规则引擎与计算树）。保留仅供回溯。

- 文件大小：17,470 字节
- SHA-256：`A11BEC59212F8FA1E376F00AF0EABCFBA00F8394CD5A904A998CDF20982FBCF5`

---

构建方式：仓库内执行 `npm run build` 重新生成 `dist/eml-workbench.html`。源码与许可证见仓库根目录。
