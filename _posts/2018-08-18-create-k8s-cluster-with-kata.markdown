---
layout: post
title:  "创建kata的K8s集群"
date:   2018-08-18 19:10:00 +0800
categories: jekyll update
---

本文介绍下如何创建kata的k8s集群，
kata项目链接：https://github.com/kata-containers
kata是什么不介绍了，能看到这篇文章的相信对kata都已经有一定了解了。

本文参考了官方的安装说明：
https://github.com/kata-containers/documentation/blob/master/how-to/how-to-use-k8s-with-cri-containerd-and-kata.md
实际上仅仅安装没有什么好讲的，文档里讲的很清楚了。但是在我们恶劣的大网络环境下，就变得有点技巧了。

言归正传。


## 安装环境

Virtual Machine:

OS: Ubuntu 18.04 

CPU: 4

Memory: 8G

在虚拟化环境中，务必保证嵌套虚拟化打开。

1. 虚拟化软件必须要支持

可以在guest OS里面通过以下命令检查：

```
$ sudo grep -E "(vmx|svm)" --color=always /proc/cpuinfo
```

如果没有显示则不支持硬件虚拟化。需要打开相应的虚拟化选项，如果是物理机则需要bios里面启用虚拟化支持。

2. 启动kvm_intel的嵌套虚拟化支持

```
# modprobe -r kvm_intel
# modprobe kvm_intel nested=1
```

## 安装kata-containers

参考：

https://github.com/kata-containers/documentation/blob/master/install/ubuntu-installation-guide.md

运行以下命令：

```
$ sudo sh -c "echo 'deb http://download.opensuse.org/repositories/home:/katacontainers:/release/xUbuntu_$(lsb_release -rs)/ /' > /etc/apt/sources.list.d/kata-containers.list"
$ curl -sL  http://download.opensuse.org/repositories/home:/katacontainers:/release/xUbuntu_$(lsb_release -rs)/Release.key | sudo apt-key add -
$ sudo -E apt-get update
$ sudo -E apt-get -y install kata-runtime kata-proxy kata-shim
```

## 安装docker

参考：

https://github.com/kata-containers/documentation/blob/master/install/docker/ubuntu-docker-install.md

实际上在本文写成之时，k8s+docker+kata的路子还没走通，必须依赖一个将annotation透传的补丁：

PR: https://github.com/moby/moby/pull/37289

docker公司一向强势，这个pr虽然很有用，但是也不知道还要多久才会被合入。

所以本文运行kata的k8s集群使用的是cri-containerd而不是docker。

不过笔者仍然建议先安装docker，来尝试kata-containers。你可以简单的运行以下命令：

```
$ docker run -ti --runtime kata busybox sh
#
```

运行成功后可以通过 `ps -ef | grep qemu` 来查看kata-containers后台对应的qemu进程。

## 安装cri-containerd

参考： https://github.com/containerd/cri/blob/master/docs/installation.md

### step 0: 安装依赖

```
$ sudo apt-get update
$ sudo apt-get install libseccomp2
```

### step 1: 下载containerd的tar包：

```
export VERSION=1.1.2
$ wget https://storage.googleapis.com/cri-containerd-release/cri-containerd-${VERSION}.linux-amd64.tar.gz
```

这一步就要用到翻墙大法了，翻墙流量也会费钱的，所以给大家提供个网盘链接吧：




## 安装cni插件

这里简化一下，使用标准的cni插件。

参考： https://github.com/containernetworking/cni

```
$ git clone https://github.com/containernetworking/plugins
$ cd plugins
$ ./build.sh 
$ mkdir -p /etc/cni/net.d
$ cat >/etc/cni/net.d/10-mynet.conf <<EOF
{
	"cniVersion": "0.2.0",
	"name": "mynet",
	"type": "bridge",
	"bridge": "cni0",
	"isGateway": true,
	"ipMasq": true,
	"ipam": {
		"type": "host-local",
		"subnet": "10.22.0.0/16",
		"routes": [
			{ "dst": "0.0.0.0/0" }
		]
	}
}
EOF
$ cat >/etc/cni/net.d/99-loopback.conf <<EOF
{
	"cniVersion": "0.2.0",
	"name": "lo",
	"type": "loopback"
}
EOF
```
