---
layout: post
title:  "kubernetes安装指南"
date:   2019-12-11 11:11:00 +0800
categories: jekyll update
---

kubeadm安装三节点集群

## 测试环境

三台VM，分别为test-vm, test-vm-1, test-vm-2，系统是ubuntu 19.04


## 下载

kubernetes的安装包，官方文档用apt get的方式，由于国内被墙了没法get到，可以直接从github上下载release包。把kubeadm，kubelet, kubectl装好就够了。docker当然也要装好。<br />
具体的安装步骤暂时略过。

## 配置kubelet

三台节点可以手动配置一下kubelet服务，配置方法都是一样的：

```
# cat > /lib/systemd/system/kubelet.service  << EOF
[Unit]
Description=kubelet: The Kubernetes Node Agent
Documentation=http://kubernetes.io/docs/

[Service]
ExecStart=/usr/bin/kubelet
Restart=always
StartLimitInterval=0
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

上面就是简单的调用了下kubelet命令，实际上还有很多参数，这个不着急。因为我们是用kubeadm配置的，所以实际上生效的是kubeadm为kubelet设置的参数，kubelet的启动将依赖kubeadm设置的bootstrap配置：

```
# mkdir -p /etc/systemd/system/kubelet.service.d/
# cat > /etc/systemd/system/kubelet.service.d/10-kubeadm.conf << EOF
[Service]
Environment="KUBELET_KUBECONFIG_ARGS=--bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf"
Environment="KUBELET_CONFIG_ARGS=--config=/var/lib/kubelet/config.yaml"
# This is a file that "kubeadm init" and "kubeadm join" generates at runtime, populating the KUBELET_KUBEADM_ARGS variable dynamically
EnvironmentFile=-/var/lib/kubelet/kubeadm-flags.env
# This is a file that the user can use for overrides of the kubelet args as a last resort. Preferably,
# the user should use the .NodeRegistration.KubeletExtraArgs object in the configuration files instead.
# KUBELET_EXTRA_ARGS should be sourced from this file.
EnvironmentFile=-/etc/default/kubelet
ExecStart=
ExecStart=/usr/bin/kubelet $KUBELET_KUBECONFIG_ARGS $KUBELET_CONFIG_ARGS $KUBELET_KUBEADM_ARGS $KUBELET_EXTRA_ARGS
EOF
```

设置开机启动

```
# systemctl daemon-reload
# systemctl enable kubelet
# systemctl start kubelet
# swapoff -a    //K8s要求关闭swap
```

docker我这里默认都配置好了，就不详细讲解了。


## 拉起master节点

这里我们用test-vm作为master节点。

主要参考这个： [https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/)

这里我先想好要用什么网络方案，自己尝试了下calico，总感觉有点问题。保守点先选择Flannel好了。<br />
引用一段：

> For flannel to work correctly, you must pass --pod-network-cidr=10.244.0.0/16 to kubeadm init.


master节点拉起K8s control plane：

```
# kubeadm init --pod-network-cidr=10.244.0.0/16 --image-repository=docker.io/mirrorgooglecontainers --kubernetes-version=1.13.4 --ignore-preflight-errors=SystemVerification
```

镜像仓库选用了docker.io/mirrorgooglecontainers 是因为默认是从k8s.io这个镜像仓库拉K8s控制组件的，这个在CN是被和谐的；K8s版本这里我永乐1.13.4，init过程把SystemVerification禁用了，是因为我的内核版本太高了（5.0.0-16），检查报错。

运行中你可能会发现报错docker.io/mirrorgooglecontainers/coredns 镜像拉取不下来，那是因为我把所有仓库都默认换到coredns里，mirrorgooglecontainer里面并不包含coredns。手动拉取一个coredns镜像并且tag为docker.io/mirrorgooglecontainers/coredns 就可以了（tag省略了）。

现在开始烧香拜佛，不顺利的话会看到报错or看不到报错，慢慢debug吧；一切顺利的话可以看到成功消息：

```
Your Kubernetes master has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

You can now join any number of machines by running the following on each node
as root:

  kubeadm join 192.168.122.2:6443 --token 8e8iei.lh8gumyd8ap7kgtz --discovery-token-ca-cert-hash sha256:84f7d6aeec39dc6efe60db6c82f8d97dc220c96e6455a1710c17daa060ef9300
```

自己按照上面信息指引把$HOME/.kube/config搞好，就可以用普通用户操作k8s集群了。下面的kubeadm留好，后面要在worker上用。

查看下状态：

```
# kubectl get node
NAME      STATUS     ROLES    AGE    VERSION
test-vm   NotReady   master   5m4s   v1.13.4

# kubectl get componentstatus
NAME                 STATUS    MESSAGE              ERROR
controller-manager   Healthy   ok                   
scheduler            Healthy   ok                   
etcd-0               Healthy   {"health": "true"}  

# kubectl -n kube-system get pod
NAME                              READY   STATUS    RESTARTS   AGE
coredns-9f7ddc475-8jl54           0/1     Pending   0          6m3s
coredns-9f7ddc475-g79j2           0/1     Pending   0          6m3s
etcd-test-vm                      1/1     Running   0          5m10s
kube-apiserver-test-vm            1/1     Running   0          5m28s
kube-controller-manager-test-vm   1/1     Running   0          5m7s
kube-proxy-vqqf4                  1/1     Running   0          6m3s
kube-scheduler-test-vm            1/1     Running   0          5m12s
```

可以看到K8s的控制面正常，但是coredns pending了，这个是因为网络还没配置。<br />
先别动worker节点，我们先把网络配好。

上面我们说用Flannel：

```
# kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/62e44c867a2846fefb68bd5f178daf4da3095ccb/Documentation/kube-flannel.yml
```

如果`kubectl -n kube-system get pod` 显示coredns变成running了，那就说明一切顺利，都成功了。

不过我就遇到了一个小问题，coredns一直不变成running，利用命令`kubectl -n kube-system describe pod coredns-9f7ddc475-8jl54`查看错误发现，/opt/cni/bin/bridge找不到导致无法teardown pod，我找到了个bridge的cni插件放过去就解决了。

## 增加worker

在worker节点test-vm-1，test-vm-2上执行同样步骤：

```
# kubeadm join 192.168.122.2:6443 --token 8e8iei.lh8gumyd8ap7kgtz --discovery-token-ca-cert-hash sha256:84f7d6aeec39dc6efe60db6c82f8d97dc220c96e6455a1710c17daa060ef9300 --ignore-preflight-errors=SystemVerification
```

第二个worker也如法炮制。<br />
顺利的话可以在master节点上看到三个node了。

```
# kubectl get node
NAME        STATUS   ROLES    AGE   VERSION
test-vm     Ready    master   28m   v1.13.4
test-vm-1   Ready    <none>   51s   v1.13.4
test-vm-2   Ready    <none>   61s    v1.13.4
```

