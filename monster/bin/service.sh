#!/bin/bash

# 这个脚本是在本地用的，线上的环境，用service.sh

rf=$(pwd)'/../'

script_path=`dirname $(pwd)`
script_path=${script_path##*/}


# 停止服务：server、statics
stopService() {
	if [ ! -f $rf'config/.pids' ]; then
		for proc in `ps -ef | grep node | grep monster.js | awk '{print $2}'`; do
			kill $proc ;
		done
	else
		cat $rf'config/.pids' | while read line; do
			kill $line ;
		done
		rm -r $rf'config/.pids'
	fi
	echo 'service & statics stopped!'
}


# 停止所有服务
stopAllService() {
    echo 'stop all web service'
    for proc in `ps -ef | grep node | grep '\.js' | awk '{print $2}'`; do
        kill   $proc ; done
    if [ -f $rf'config/.pids' ]; then
        rm -r $rf'config/.pids'
    fi
}


# 启动服务：server、statics
startService() {
	server_logf='/tmp/log/'$script_path'-server/'
	server_log=$server_logf`date +%Y%m%d`'.log'
	statics_logf='/tmp/log/'$script_path'-statics/'
	statics_log=$statics_logf`date +%Y%m%d`'.log'
	echo '{"server":"'${server_log}'","statics":"'${statics_log}'"}' > $rf'config/.log_name.json'

	mkdir -p $server_logf
	mkdir -p $statics_logf
	if [ ! -f $server_log ];then
	    touch $server_log
	fi
	if [ ! -f $statics_log ];then
    	touch $statics_log
    fi
	echo 'SERVICE START AT '` date +%Y/%m/%d-%T` >> $server_log
	echo 'SERVICE START AT '` date +%Y/%m/%d-%T` >> $statics_log

	cd $rf'bin/' && nohup /usr/local/bin/node monster.js server >> $server_log 2>&1 &
	cd $rf'bin/' && nohup /usr/local/bin/node monster.js statics >> $statics_log 2>&1 &
	echo 'web service & statics service started! log file ref here:'
	echo "server:  "$server_log
	echo "static:  "$statics_log
}

# 重启mysql
restartMySql() {
    if [ "`pgrep mysql`" == "" ];then
        # Mac系统
        if [[ "`which sw_vers`" != "" && "`sw_vers -productName`" != "" ]];then
            mysql.server start
        else
            # Linux系统
            service mysqld start
        fi
    fi
}

# 清除缓存文件
clearTmp(){
	cd $rf'bin/' && /usr/local/bin/node monster.js clear
}

if [ $# -eq 0 ];then
	echo "you should pass args start|restart|stop|stopAll|clear"
else
	case $1 in
		"clear")
			clearTmp
			;;
		"stop") 
			stopService
			;;
		"stopAll") 
			stopAllService
			;;
		"start")
			clearTmp
			startService
			;;
		"restart") 
			stopService
			clearTmp
			startService
			;;
	esac
fi	

