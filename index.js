"use strict";

var childProcess = require("child_process");
var spawn = childProcess.spawn;
var exec = childProcess.exec;

function showDebugInfo (pid, callback) {
  var ps;
  switch (process.platform) {
    case "darwin":
      ps = spawn("pgrep", ["-P", pid, "-l"]);
      break;
    default:
      ps = spawn("ps", ["--ppid", pid]);
      break;
  }

  var allData = "";
  ps.stdout.on("data", function (data) {
    var data = data.toString("ascii");
    allData += data;
  });
  ps.on("close", function () {
    console.log("ps info for " + pid);
    console.log(allData);
    callback();
  });
}

function killChildProcesses (pid, callback) {
  getTree(pid, function (tree) {
    var children = tree[pid.toString()];

    var killNext = function () {
      if (children.length > 0) {
        treeKill(children.shift(), "SIGKILL", function () {
          killNext();
        });
      } else {
        callback();
      }
    };

    if (children && children.length > 0) {
      killNext();
    } else {
      callback();
    }
  });
}

function getTree (pid, callback) {
  var tree = {};
  var pidsToProcess = {};
  tree[pid] = [];
  pidsToProcess[pid] = 1;

  switch (process.platform) {
    case "win32":
      throw new Error("Operation unsupported on Windows");
      break;
    case "darwin":
      buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
        return spawn("pgrep", ["-P", parentPid]);
      }, function () {
        if (lib.debug) {
          showDebugInfo(pid, function () {
            callback(tree);
          })
        } else {
          callback(tree);
        }
      });
      break;
    case "sunos":
      throw new Error("Operation unsupported on SunOS");
      break;
    default: // Linux
      buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
        return spawn("ps", ["-o", "pid", "--no-headers", "--ppid", parentPid]);
      }, function () {
        if (lib.debug) {
          showDebugInfo(pid, function () {
            callback(tree);
          })
        } else {
          callback(tree);
        }
      });
      break;
  }
}

function treeKill (pid, signal, callback) {
  var tree = {};
  var pidsToProcess = {};
  tree[pid] = [];
  pidsToProcess[pid] = 1;

  switch (process.platform) {
    case "win32":
      exec("taskkill /pid " + pid + " /T /F", callback);
      break;
    case "darwin":
      buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
        return spawn("pgrep", ["-P", parentPid]);
      }, function () {
        killAll(tree, signal, callback);
      });
      break;
    case "sunos":
      throw new Error("Operation unsupported on SunOS");
      break;
    default: // Linux
      buildProcessTree(pid, tree, pidsToProcess, function (parentPid) {
        return spawn("ps", ["-o", "pid", "--no-headers", "--ppid", parentPid]);
      }, function () {
        killAll(tree, signal, callback);
      });
      break;
  }
};

function killAll (tree, signal, callback) {
  var killed = {};
  try {
    Object.keys(tree).forEach(function (pid) {
      tree[pid].forEach(function (pidpid) {
        if (!killed[pidpid]) {
          killPid(pidpid, signal);
          killed[pidpid] = 1;
        }
      });
      if (!killed[pid]) {
        killPid(pid, signal);
        killed[pid] = 1;
      }
    });
  } catch (err) {
    if (callback) {
      return callback(err);
    } else {
      throw err;
    }
  }
  if (callback) {
    return callback();
  }
}

function killPid(pid, signal) {
  try {
    process.kill(parseInt(pid, 10), signal);
  }
  catch (err) {
    if (err.code !== "ESRCH") throw err;
  }
}

function buildProcessTree (parentPid, tree, pidsToProcess, spawnChildProcessesList, cb) {
  var ps = spawnChildProcessesList(parentPid);
  var allData = "";
  ps.stdout.on("data", function (data) {
    var data = data.toString("ascii");
    allData += data;
  });

  var onClose = function (code) {
    delete pidsToProcess[parentPid];

    if (code != 0) {
      // no more parent processes
      if (Object.keys(pidsToProcess).length == 0) {
        cb();
      }
      return;
    }

    allData.match(/\d+/g).forEach(function (pid) {
      pid = parseInt(pid, 10);
      tree[parentPid].push(pid);
      tree[pid] = [];
      pidsToProcess[pid] = 1;
      buildProcessTree(pid, tree, pidsToProcess, spawnChildProcessesList, cb);
    });
  };

  ps.on("close", onClose);
}


var lib = {
  debug: false,
  kill: treeKill,
  killPid: killPid,
  getTree: getTree,
  killChildProcesses: killChildProcesses
};

module.exports = lib;