#! /bin/bash

# ====================================================
# 每个模块在提测之前都需要通过这个脚本来做一些事情：
# 1、创建一个output目录（如果还没有）：线上部署用
# 2、将MVC代码打包到output下
# 3、压缩JS放到output下
# 4、处理less为css，放到output下
# 5、将其他静态文件copy到output下
# 6、编译结果：output/modName/
#
# ps：这个脚本是被动态copy到某个App下执行的
# ====================================================

# 模块名
modName="$1"

# 删掉output目录
rm -rf output/$modName

# 文件拷贝、代码压缩、创建新的压缩包
mkdir -p output/$modName output/$modName/static
if [ -d controller ];then
   cp -r controller output/$modName/ > /dev/null
fi
if [ -d model ];then
   cp -r model output/$modName/ > /dev/null
fi
if [ -d views ];then
   cp -r views output/$modName/ > /dev/null
fi
if [ -d static ];then
   cp -r static output/$modName/ > /dev/null
fi
if [ -d node_modules ];then
   cp -r node_modules output/$modName/ > /dev/null
fi
find output/$modName/ -type d -name ".svn" | xargs rm -rf

# 进入到monster的bin目录执行相关命令，对static做一下相关处理
curDir=`pwd`

cd output/monster/bin

# 对静态文件中的图片、swf等加上md5戳，解决浏览器缓存问题
node stamp.js $modName

# 压缩js：注意，下面的"../../"不能换成"$curDir/"，因为$curDir可能是软链接
jsDir=../../$modName/static/js
if [ -d $jsDir ];then
    node minJs.js $jsDir $modName
fi

# less to css
cssDir=../../$modName/static/css
if [ -d $cssDir ];then
    node mkCss.js $cssDir
    find $cssDir/ -type f -name "*.less" | xargs rm -rf
fi

# 删除monster
cd $curDir/output
rm -rf monster

cd $curDir/