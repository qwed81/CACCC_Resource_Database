#!/bin/bash

DockerSvc=$(docker container ls --filter name="mongo" --format '{{.Image}}')
if [[ "$DockerSvc" != "mongo" ]]; then
    docker run --name mongo -p 27017:27017 -v caccc-db:/data/db -d --rm mongo
    wait
fi
python -mwebbrowser http://localhost:3000
node .\\server.js