---
layout: post
title:  "runc源码阅读"
date:   2017-09-12 22:40:46 +0800
categories: jekyll update
---

runc是docker的核心底层依赖，是容器运行的runtime，目前所属的仓库是opencontainers/runc,
是docker将原先的libcontainer模块独立出来，并贡献给oci社区的产物。

一直想写一下runc的源码分析，但是一直没有时间。暂时先把自己阅读runc过程中画得xmind思维脑图放出来吧，
里面的内容是runc的代码流程分析。有时间再回来补齐源码分析。

[runc源码分析xmind文件](/images/runc阅读.xmind)
