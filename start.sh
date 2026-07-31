#!/bin/bash
cd /home/ubuntu/Kaiser.charon
exec node index.js >> charon.log 2>&1
