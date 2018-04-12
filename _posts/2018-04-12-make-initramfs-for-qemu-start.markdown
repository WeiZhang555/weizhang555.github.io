---
layout: post
title:  "Kernel debug basics-- how to make an initramfs"
date:   2018-04-12 19:10:00 +0800
categories: jekyll update
---

```
#!/bin/bash
set -e

CWD=`pwd`
BUSYBOX_FILE=busybox-1.28.1
BUSYBOX_SRC=/tmp/busybox
BUSYBOX_BUILD=/tmp/busybox-build
INITRAMFS_DIR=/tmp/initramfs

mkdir -p $BUSYBOX_SRC $BUSYBOX_BUILD $INITRAMFS_DIR
if [ ! -e $BUSYBOX_FILE ]; then
        wget http://busybox.net/downloads/${BUSYBOX_FILE}.tar.bz2
fi
tar -C $BUSYBOX_SRC -xvf ${BUSYBOX_FILE}.tar.bz2

cd ${BUSYBOX_SRC}/${BUSYBOX_FILE} && make O=${BUSYBOX_BUILD} defconfig
# enable busybox static build
cd ${BUSYBOX_BUILD} && sed -i "s/# CONFIG_STATIC is not set/CONFIG_STATIC=y/" .config \
        && make && make install

cd $INITRAMFS_DIR && rm -rfv * && mkdir -p bin sbin etc proc sys usr/bin usr/sbin \
        && cp -a $BUSYBOX_BUILD/_install/* .

# if you want to add iozone binary and its linked .so, you can add command here:
# cp iozone $INITRAMFS_DIR/bin

cat > $INITRAMFS_DIR/init << 'EOF'
#!/bin/sh

mount -t proc none /proc
mount -t sysfs none /sys

cat <<!


Boot took $(cut -d' ' -f1 /proc/uptime) seconds

        _       _     __ _                  
  /\/\ (_)_ __ (_)   / /(_)_ __  _   ___  __
 /    \| | '_ \| |  / / | | '_ \| | | \ \/ /
/ /\/\ \ | | | | | / /__| | | | | |_| |>  < 
\/    \/_|_| |_|_| \____/_|_| |_|\__,_/_/\_\ 


Welcome to mini_linux


!
exec /bin/sh
EOF

chmod +x init

# package into a initramfs
rm -fv /tmp/initramfs.cpio.gz || true
find . -print0 | cpio --null -ov --format=newc \
  | gzip -9 > /tmp/initramfs.cpio.gz

echo "===========> initramfs is saved as /tmp/initramfs.cpio.gz"

cd ${CWD}
# boot with qemu
# sudo qemu-system-x86_64 -enable-kvm -kernel build/kernel -initrd initramfs.cpio.gz -nographic -append "console=ttyS0"
```
