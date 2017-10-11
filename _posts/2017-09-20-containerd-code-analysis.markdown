---
layout: post
title:  "containerd源码阅读(1)--框架篇"
date:   2017-09-12 22:40:46 +0800
categories: jekyll update
---

## 1. 简介

containerd是与docker直接沟通的下属组件，详细是什么不说了。
每个docker daemon启动的时候都会启动一个containerd daemon，启动容器的时候，
每个容器的init进程／exec进程都会对应一个containerd-shim进程，
containerd-shim同样是containerd库里面单独的一个二进制程序，
containerd-shim会调用runc最终启动容器。
这些基本的知识一笔带过不详细展开。

随着docker改名为moby，docker的大部分功能，比如image管理，容器运行都会下沉到containerd，
docker会越来越侧重于编排调度部分--swarm。

简单分析下containerd的代码架构，作为官方containerd文档的一个补充。本篇以git commit d700a9c35b09239c8c056cd5df73bc19a79db9a9为标准讲解。

## 2. grpc

containerd的架构极其依赖grpc协议。

```
# ls api/services/
containers  content  diff  events  images  namespaces  snapshot  tasks  version
```

`api/services`目录下存放着containerd提供的不同服务对应的grpc接口。
以比较基础的content服务为例，

```
# ls api/services/content/v1/
content.pb.go  content.proto
```

下面一共有两个文件，一个content.proto一个是.pb.go, 其中用户只需要定义content.proto文件，
而程序最终使用的content.pb.go则可以由grpc命令自动生成。

```
# protoc --go_out=. *.proto
```

打开content.proto 来看，里面主要定义了一个service：

```
13 service Content {
 14     // Info returns information about a committed object.
 15     //
 16     // This call can be used for getting the size of content and checking for
 17     // existence.
 18     rpc Info(InfoRequest) returns (InfoResponse);
 19 
 20     // Update updates content metadata.
 21     //
 22     // This call can be used to manage the mutable content labels. The
 23     // immutable metadata such as digest, size, and committed at cannot
 24     // be updated.
 25     rpc Update(UpdateRequest) returns (UpdateResponse);
 26 
 27     // List streams the entire set of content as Info objects and closes the
 28     // stream.
 29     //
 30     // Typically, this will yield a large response, chunked into messages.
 31     // Clients should make provisions to ensure they can handle the entire data
 32     // set.
 33     rpc List(ListContentRequest) returns (stream ListContentResponse);
 34 
 35     // Delete will delete the referenced object.
 36     rpc Delete(DeleteContentRequest) returns (google.protobuf.Empty);
...省略...

```

以及很多message结构体，message可以理解成是service定义的接口使用到的结构体，是通信的结构化的数据流。

使用protoc命令生成的.pb.go文件内同步包含server端和client端的接口实现。

## containerd启动

以containerd启动过程来看。入口为cmd/containerd/main.go, 程序一启动首先就把信号处理函数准备好了。

```
cmd/containerd/main.go:
 85         done := handleSignals(ctx, signals, serverC)
 86         // start the signal handler as soon as we can to make sure that
 87         // we don't miss any signals during boot
 88         signal.Notify(signals, handledSignals...)
```

后面都是准备并启动grpc server。核心是准备server的这一句

```
cmd/containerd/main.go:
106	server, err := server.New(ctx, config)
```

进去来看server.New的实现。

前面都是创建目录，主要看加载plugin的部分。

1. load plugins

核心代码：

```
162 func loadPlugins(config *Config) ([]*plugin.Registration, error) {
163     // load all plugins into containerd
164     if err := plugin.Load(filepath.Join(config.Root, "plugins")); err != nil {
165         return nil, err
166     }
167     // load additional plugins that don't automatically register themselves
168     plugin.Register(&plugin.Registration{
169         Type: plugin.ContentPlugin,  // "io.containerd.content.v1"
170         ID:   "content",
171         Init: func(ic *plugin.InitContext) (interface{}, error) {
172             return local.NewStore(ic.Root)
173         },
174     })
175     plugin.Register(&plugin.Registration{
176         Type: plugin.MetadataPlugin,  // "io.containerd.metadata.v1"
177         ID:   "bolt",
178         Init: func(ic *plugin.InitContext) (interface{}, error) {
179             if err := os.MkdirAll(ic.Root, 0711); err != nil {
180                 return nil, err
181             }
182             return bolt.Open(filepath.Join(ic.Root, "meta.db"), 0644, nil)
183         },
184     })
185 
186     // return the ordered graph for plugins
187     return plugin.Graph(), nil
188 }
```

164行进入plugin包，内部实现是golang从1.8（？）开始支持的新特性--go语言自带的plugin支持，
可以加载用户自定义的插件。

168和175是注册了两个最基本的插件，一个是`content`插件，一个是metadata插件，这两个插件基本上是其他插件的基础。
其中content插件主要是依赖content/local那个子package，metadata主要是操纵boltdb数据库meta.db

```
root@ubuntu:~/gocode/src/github.com/containerd/containerd# ls /var/lib/containerd/
io.containerd.content.v1.content  io.containerd.runtime.v1.linux      io.containerd.snapshotter.v1.overlayfs
io.containerd.metadata.v1.bolt    io.containerd.snapshotter.v1.btrfs
root@ubuntu:~/gocode/src/github.com/containerd/containerd# ls /var/lib/containerd/io.containerd.metadata.v1.bolt/
meta.db
```

`plugin.Register`函数其实很简单，就是把某个Registration结构体加入到plugin包的register全局结构体内：

```
 59 var register = struct {
 60     sync.Mutex
 61     r []*Registration
 62 }{}
```

上面的r即承载着所有的Registration结构体。

上文中提到的loadPlugins最后`return plugin.Graph()`同样定义在plugin包里，
里面根据Registration.Requires对所有Registration进行了排序，
给出了一个按依赖关系排序的插件数组。比方说plugin a, b, c, 其中b定义了requires a, c定义了requires b,
那么最终给出的排序的插件数组就是[a, b, c] 而不是[b, a, c]或其他。

但是Registration难道只有两个吗？两个插件为什么需要这么复杂？
答案是当然不是只有两个，还有其他的插件，只是他们初始化过程比较隐晦，不是那么直观。

2. 其他插件在哪儿？

答案是在以下两个文件中：

```
cmd/containerd/builtins.go:
  3 // register containerd builtins here
  4 import (
  5     _ "github.com/containerd/containerd/differ"
  6     _ "github.com/containerd/containerd/services/containers"
  7     _ "github.com/containerd/containerd/services/content"
  8     _ "github.com/containerd/containerd/services/diff"
  9     _ "github.com/containerd/containerd/services/events"
 10     _ "github.com/containerd/containerd/services/healthcheck"
 11     _ "github.com/containerd/containerd/services/images"
 12     _ "github.com/containerd/containerd/services/namespaces"
 13     _ "github.com/containerd/containerd/services/snapshot"
 14     _ "github.com/containerd/containerd/services/tasks"
 15     _ "github.com/containerd/containerd/services/version"
 16 )
```

以及(以linux平台为例，其他平台的文件见其他后缀文件)：

```
cmd/containerd/builtins_linux.go:
  3 import (
  4     _ "github.com/containerd/containerd/linux"
  5     _ "github.com/containerd/containerd/metrics/cgroups"
  6     _ "github.com/containerd/containerd/snapshot/overlay"
  7 )
```

其中import _ "xxx" 就代表着只执行这个包的init函数，但是不使用这个包的任何函数。

以`services/content`为例：

```
services/content/service.go:
 38 func init() {
 39     plugin.Register(&plugin.Registration{
 40         Type: plugin.GRPCPlugin,
 41         ID:   "content",
 42         Requires: []plugin.PluginType{
 43             plugin.ContentPlugin,
 44             plugin.MetadataPlugin,
 45         },
 46         Init: NewService,
 47     })
 48 }
```

(未完待续)

[containerd源码分析xmind文件](/images/containerd阅读.xmind)
