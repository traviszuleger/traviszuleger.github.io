var emulator;
var lcd;
var ctx;
var stop;
var lastFrameTimeMs = 0; // The last time the loop was run
var maxFPS = 10; // The maximum FPS we want to allow

var avgInstrsPerSecond = 0;
var totalInstrs = 0;
var totalSeconds = 0;

var lastRowSearched = null;
var lastRowColor = null;

var trackInstructions = true;

const renderObject =
{
}

Module['onRuntimeInitialized'] = function() // Once the emscripten generated javascript file is loaded, call this function.
{
  var header1 = document.getElementById("header1");

  initStringFormat();

  document.getElementById("togglebutton").setAttribute("style", "background-color: #FF4040; width:200px");
  document.getElementById("togglebutton").innerHTML = "Start";

  document.getElementById("toggleRegisters").setAttribute("style", "background-color: #FF4040; width:200px");
  document.getElementById("toggleMemory").setAttribute("style", "background-color: #FF4040; width:200px");
  document.getElementById("toggleOpcode").setAttribute("style", "background-color: #FF4040; width:200px");

  document.getElementById("speed").oninput = function()
  {
    document.getElementById("speedValue").innerHTML = "Instructions per Second: " + ((this.value >= 100) ? "No Limit" : this.value);
  }


  stop = true;
  const width = 256;
  const height = 256;

  var canvas = document.getElementById("canvas") || { };
  canvas.width = width;
  canvas.height = height;
  emulator = new Module.Emulator("./BOOT_ROM.bin");
  // var emulator = new Module.Emulator("./pokemon_red.rom");

  var bufAddr = emulator.getBufAddr();

  lcd = new ImageData
  (
    new Uint8ClampedArray
    (
      wasmMemory.buffer,
      bufAddr,
      4 * width * height,
    ),
    width,
    height
  );

  checkMemory();
  refreshRegisters();

  ctx = canvas.getContext("2d");
}

var updateVariablesIf = 0;
var seconds_lastFrameTime = 0;

function gameLoop(timestamp)
{
  if(timestamp >= seconds_lastFrameTime + 1000)
  {
    seconds_lastFrameTime = timestamp;
    updateVariablesIf++;
    totalSeconds++;
    document.getElementById("totalInstrs").innerHTML = "Total instructions executed: " + totalInstrs;
    document.getElementById("totalSeconds").innerHTML = String.format("Uptime: {0}h:{1}m:{2}s", Math.floor(totalSeconds / (60*60)), Math.floor((totalSeconds % (60*60)) / 60), totalSeconds % 60);
    refreshRegisters();
  }
  if(updateVariablesIf % 5 == 0)
  {
    avgInstrsPerSecond = totalInstrs / totalSeconds;
    document.getElementById("avgInstrs").innerHTML = "Average instructions per second: " + avgInstrsPerSecond;
  }

  if(document.getElementById("speed").value < 100 && numInstrsToExecute <= 0)
  {
    if (timestamp < lastFrameTimeMs + (1000 / (document.getElementById("speed").value)))
    {
      if(!stop)
      {
        window.requestAnimationFrame(gameLoop)
      }
      return;
    }
    lastFrameTimeMs = timestamp;
    totalInstrs++;
    emulator.tick();
    if(trackInstructions)
    {
      updateInstructions();
    }
  }
  else
  {
    while(emulator.notRendering() && (numInstrsToExecute > 0 && totalInstrs < numInstrsToExecute))
    {
      totalInstrs++;
      emulator.tick();
      if(trackInstructions)
      {
        updateInstructions();
      }
    }
    if(numInstrsToExecute > 0 && totalInstrs >= numInstrsToExecute)
    {
      numInstrsToExecute = 0;
      toggleEmulator();
      return;
    }
  }

  ctx.putImageData(lcd, 0, 0);

  if(!stop)
  {
    window.requestAnimationFrame(gameLoop)
  }
}

function pushScreenData()
{
  ctx.putImageData(lcd, 0, 0);
}

function toggleEmulator()
{
  stop = !stop;
  document.getElementById("togglebutton").setAttribute("style", stop ? "background-color: #FF4040; width:200px" : "background-color: #40FF40; width:200px");
  document.getElementById("togglebutton").innerHTML = stop ? "Start" : "Stop";
  if(!stop)
  {
    window.requestAnimationFrame(gameLoop);
  }
}


function refreshScreen()
{
  if(stop)
  {
    ctx.putImageData(lcd, 0, 0);
  }
}

function refreshMemory()
{
  address = 0;
  var memtable = document.getElementById("mem-table");
  while(memtable.hasChildNodes())
  {
    memtable.removeChild(memtable.firstChild);
  }
  checkMemory();
}

function refreshRegisters()
{
  var regtable = document.getElementById("reg-table");
  var registerInfo = emulator.dumpRegisters_GetString().split("|");
  while(regtable.hasChildNodes())
  {
    regtable.removeChild(regtable.firstChild);
  }
  for(var i = 1; i < registerInfo.length-1; ++i)
  {
    var row = document.createElement("tr");
    var reg = document.createElement("th");
    var val = document.createElement("th");

    row.setAttribute('id', 'reg_' + registerInfo[i].split(": "[0]));

    reg.innerHTML = registerInfo[i].split(": ")[0];
    val.innerHTML = registerInfo[i].split(": ")[1];

    style = "width:50%;height:14px;";
    if(i % 2 == 0)
    {
      style += "background-color:#d0d0d0;";
    }

    reg.setAttribute("style", style);
    val.setAttribute("style", style);

    row.appendChild(reg);
    row.appendChild(val);
    regtable.appendChild(row);
  }

  var flagsInBytes = registerInfo[registerInfo.length-1].split(": ")[1].split(" ");
  flags = ["Full", "Half", "Subtract", "Zero"];
  var i = 3;
  flagsInBits = flagsInBytes[6].split("");

  flagsInBits.forEach(function(bit)
  {
    var row = document.createElement("tr");
    var reg = document.createElement("th");
    var val = document.createElement("th");

    row.setAttribute('id', 'flags_' + i);

    reg.innerHTML = "Flag - " + flags[i];
    val.innerHTML = bit;

    style = "width:50%;height:14px;";
    if(i % 2 == 1)
    {
      style += "background-color:#d0d0d0;";
    }

    reg.setAttribute("style", style);
    val.setAttribute("style", style);

    row.appendChild(reg);
    row.appendChild(val);
    regtable.appendChild(row);
    i--;
  });
}

const REG_DUMP = 1;
const MEM_DUMP = 2;
const OP_DEBUG = 3;

var dumpingRegisters = false;
var dumpingMemory = false;

function toggleRegisterDumps()
{
  var status = emulator.control(REG_DUMP);
  document.getElementById("toggleRegisters").setAttribute("style", (status == 1) ? "background-color: #40FF40; width:200px" : "background-color: #FF4040; width:200px");
}

function toggleMemoryDumps()
{
  var status = emulator.control(MEM_DUMP);
  document.getElementById("toggleMemory").setAttribute("style", (status == 1) ? "background-color: #40FF40; width:200px" : "background-color: #FF4040; width:200px");
}

function toggleOpcodeDebugging()
{
  var status = emulator.control(OP_DEBUG);
  document.getElementById("toggleOpcode").setAttribute("style", (status == 1) ? "background-color: #40FF40; width:200px" : "background-color: #FF4040; width:200px");
}

function toggleInstructionTracking()
{
  trackInstructions = !trackInstructions;
  document.getElementById("toggle-instructions-tracking").setAttribute("style", trackInstructions ? "margin-left:13.5%;width:200px;background-color:#40FF40;" : "margin-left:13.5%;width:200px;background-color:#FF4040;" );
  document.getElementById("toggle-instructions-tracking").innerHTML = trackInstructions ? "Stop tracking instructions" : "Start tracking instructions";
}

var isInstrInfoAvailable = false;

function toggleInstructionsInfo()
{
  if(isInstrInfoAvailable)
  {
    document.getElementById("instructions-div").setAttribute("style", "border:2px solid #808080;border-radius:20px;margin:auto;padding-top:0.5%;background-color:#d0d0d0;text-align:center;display:none;float:left;");
    document.getElementById("toggle-instructions-info").setAttribute("style", "background-color: #FF4040; width:200px");
  }
  else
  {
    document.getElementById("instructions-div").setAttribute("style", "border:2px solid #808080;border-radius:20px;margin:auto;padding-top:0.5%;background-color:#d0d0d0;text-align:center;display:block;float:left;");
    document.getElementById("toggle-instructions-info").setAttribute("style", "background-color: #40FF40; width:200px");
  }
  isInstrInfoAvailable = !isInstrInfoAvailable;
}

function memorySearch()
{
  if(lastRowSearched != null)
  {
    lastRowSearched.style.backgroundColor = lastRowColor;
  }
  var memtable = document.getElementById('mem-table');
  while(memtable.hasChildNodes())
  {
    memtable.removeChild(memtable.firstChild);
  }

  var memdiv = document.getElementById('mem-div');
  var val = document.getElementById('memory-addr').value;

  for(var i = 1; i < 4; ++i)
  {
    if(val.length == i)
    {
      var s = "";
      for(var j = 0; j < 4-i; ++j)
      {
        s += "0";
      }

      val = String.format(s + "{0}", val);
    }
  }
  var scrollTo = null;
  loadMemory(val);
  scrollTo = document.getElementById('mem_0x' + val);

  memdiv.scrollTop = scrollTo.offsetTop - memdiv.offsetTop + memdiv.scrollTop;

  lastRowColor = scrollTo.style.backgroundColor;
  scrollTo.style.backgroundColor = "#ffff00";
  lastRowSearched = scrollTo;
}

var address = 0;

function checkMemory()
{
  var memdiv = document.getElementById('mem-div');
  if(memdiv.scrollTop / (memdiv.scrollHeight - memdiv.clientHeight) > 0.50 || address == 0)
  {
    loadMemory();
  }
}

function loadMemory(addr)
{
  var memtable = document.getElementById('mem-table');

  var current = addr ? parseInt(addr, 16)+8 : address + 0x0400;
  address     = addr ? parseInt(addr, 16)-8 : address;
  address     = address <= 0 ? 0 : address;

  for(; address <= current && address <= 0xFFFF; ++address)
  {
    var row  = document.createElement("tr");
    var addr = document.createElement("th");
    var val  = document.createElement("th");

    var s = emulator.formattedMemory(address).split("|");

    row.setAttribute('id', 'mem_' + s[0]);
    addr.innerHTML = s[0];
    val.innerHTML = s[1];
    style = "width:50%;height:14px;";
    if(address % 2 == 1)
    {
      row.style = "background-color:#d0d0d0;";
    }
    addr.setAttribute("style",style);
    val.setAttribute("style",style);

    row.appendChild(addr);
    row.appendChild(val);
    memtable.appendChild(row);
  }
}

function updateInstructions()
{
  var instr1 = document.getElementById('instr_1');
  var instr2 = document.getElementById('instr_2');
  var instr3 = document.getElementById('instr_3');
  var instr4 = document.getElementById('instr_4');
  var instr5 = document.getElementById('instr_5');

  instr5.innerHTML = instr4.innerHTML;
  instr4.innerHTML = instr3.innerHTML;
  instr3.innerHTML = instr2.innerHTML;
  instr2.innerHTML = instr1.innerHTML;
  instr1.innerHTML = emulator.getLastInstructionExecuted();
}

var numInstrsToExecute = 0;

function executeNumInstructions()
{
  numInstrsToExecute = document.getElementById('num-instrs-exe').value;
  toggleEmulator();
}

function initStringFormat()
{
  if (!String.format)
  {
    String.format = function(format)
    {
      var args = Array.prototype.slice.call(arguments, 1);
      return format.replace(/{(\d+)}/g, function(match, number)
      {
        return typeof args[number] != 'undefined' ? args[number] : match;
      });
    };
  }
}
