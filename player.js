// JSmod JavaScript MOD player
// Copyright (C) 2011-2015 A.T.Brask <atbrask@gmail.com>

////////// Initialization ////////

window.onload = function()
{
    // Check for file API
    if (!(window.File && window.FileReader && window.FileList && window.Blob))
    {
        alert("OLD browser detected! Local file handling API is missing! Please upgrade to the current version of Firefox or Chrome.");
        return;
    }
    
    // Check for audio API
    if (window.AudioContext == undefined)
    {
        alert("OLD browser detected! Web Audio API is missing! Please upgrade to the current version of Firefox or Chrome.");
        return;
    }

    audioOutput = new webAudio();

    // File API event callbacks

    function handleFileSelect(evt) 
    {
        evt.stopPropagation();
        evt.preventDefault();

        var files = evt.dataTransfer.files;
        if (files.length < 1)
            return;

        var reader = new FileReader();
        
        reader.onloadend = function(file)
        {
            var sIn = file.target.result;
            var sOut=[];
            for(var i=0;i<sIn.length;i++)
                sOut[i]=sIn.charCodeAt(i) & 0xff;

            var mod = new module(sOut);
            initAudioOutput(mod);
            initMetadata(mod);
            initSampleList(mod);
            initPatterns(mod);
            refreshGUI();
        }
        reader.readAsBinaryString(files[0]);
    }

    function handleDragOver(evt)
    {
        evt.stopPropagation();
        evt.preventDefault();
    }
    
    // Setup the drag'n'drop listeners.
    var dropZone = document.getElementById('drop_zone');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', handleFileSelect, false);

    // Setup player event listeners
    document.addEventListener('sequencer-update', refreshGUI, false);
    this.currentpatternid = -1;

    function refreshGUI(evt)
    {
        if (audioOutput == null || audioOutput.sequencer == null)
            return;

        var patternindex = audioOutput.sequencer.currentpatternindex;
        if (patternindex < 0)
            patternindex = 0
        var pattern = audioOutput.sequencer.module.patterntable[patternindex];
        if (this.currentpatternid != pattern)
        {
            var old = document.getElementById("pattern"+this.currentpatternid)
            if (old != undefined)
                old.setAttribute("class", "pattern");
            document.getElementById("patterncurrent").textContent = pattern;
            this.currentpattern = document.getElementById("pattern"+pattern);
            this.currentpattern.setAttribute("class", "activepattern");
            this.currentpatternid = pattern
        }

        var row = audioOutput.sequencer.patternrow - 1;
        if (row < 0)
            row = 0;
        this.currentpattern.style.marginTop = (-16*row)+"px";
    }
}
    
////////// Web Audio API ///////////

function webAudio()
{
    this.context = new AudioContext();
    this.node = this.context.createScriptProcessor(2048, 1, 2);

    this.leftbuf = new buffer(2048);
    this.rightbuf = new buffer(2048);
    var _self = this;

    this.node.onaudioprocess = function (e)
    {
        if (_self.sequencer.done)
        {
            _self.rewind();
            _self.pause();
            return;
        }

        if (!_self.sequencer || !_self.mixer)
            return;
        var leftdata = e.outputBuffer.getChannelData(0);
        var rightdata = e.outputBuffer.getChannelData(1);
        while(!_self.leftbuf.chunkready())
        {
            _self.sequencer.update();
            _self.leftbuf.add(_self.mixer.leftbuffer, _self.mixer.size);
            _self.rightbuf.add(_self.mixer.rightbuffer, _self.mixer.size);

        }
        _self.leftbuf.update();
        _self.rightbuf.update();
        for (var i = 0; i < _self.leftbuf.chunksize; i++)
        {
            leftdata[i] = _self.leftbuf.chunk[i];
            rightdata[i] = _self.rightbuf.chunk[i];
        }
    }
}

webAudio.prototype.getSampleRate = function()
{
    return this.context.sampleRate;
}

webAudio.prototype.rewind = function()
{
    this.pause();
    if (this.sequencer)
        this.sequencer.reset();
    this.leftbuf.reset();
    this.rightbuf.reset();
}

webAudio.prototype.play = function()
{
    this.currentpatternid = -1;
    this.leftbuf.reset();
    this.rightbuf.reset();
    this.node.connect(this.context.destination);
}

webAudio.prototype.pause = function()
{
    this.node.disconnect();
}

//////// GUI crap /////////
function initAudioOutput(mod)
{
    audioOutput.rewind();
    audioOutput.mixer = new modaudiomixer(mod, 0.35, PALCLOCK);
    audioOutput.sequencer = new modsequencer(mod, audioOutput.mixer, 0.35, audioOutput.getSampleRate());
}

function initPatterns(mod)
{
    var patterns = document.getElementById("patterns");
    while (patterns.firstChild)
        patterns.removeChild(patterns.firstChild);

    var cols = [2];
    for(var i = 0; i < mod.channelcount; i++)
        cols[i+1] = 12;

    for (var patternidx = 0; patternidx < mod.patterns.length; patternidx++)
    {
        var divpattern = document.createElement('div');
        divpattern.className = "pattern";
        divpattern.id = "pattern"+patternidx;

        for (var row = 0; row < 6; row++)
        {
            divpattern.innerHTML += "</br>";
        }
        
        divpattern.innerHTML += getHeaderRow(cols) + "</br>";
        
        for (var row = 0; row < 64; row++)
        {
            var notes = "|"+(" "+row.toString(10)).substr(-2) + "| ";
            for (var i = 0; i < mod.channelcount; i++)
            {
                var ch = mod.patterns[patternidx].channels[i];
                notes += ch.noteString(row) + " " + ch.sampleString(row) + " " + ch.effectString(row) + " | ";
            }
            divpattern.innerHTML += notes + "</br>";
        }
        divpattern.innerHTML += getFooterRow(cols) + "</br>";

        for (var row = 0; row < 6; row++)
        {
            divpattern.innerHTML += "</br>";
        }


        patterns.appendChild(divpattern);
    }
}

function initMetadata(mod)
{
    document.getElementById("title").firstChild.nodeValue = mod.title;
    document.getElementById("channels").firstChild.nodeValue = mod.channelcount + " channels";
}

function getColumnRow(cols, begin, fill, separator, end)
{
    var array = []
    for (var idx = 0; idx < cols.length; idx++)
        array[idx] = fill.repeat(cols[idx]);
    return begin + array.join(separator) + end;
}

function getHeaderRow(cols)
{
    return getColumnRow(cols, "&#x250C;", "&#x2500;", "&#x252C;", "&#x2510;");
}

function getFooterRow(cols)
{
    return getColumnRow(cols, "&#x2514;", "&#x2500;", "&#x2534;", "&#x2518;");
}

function initSampleList(mod)
{
    var sampleText = getHeaderRow([2, 24]) + "</br>";
    for (var idx = 1; idx < 32; idx++)
    {
        sampleText += "|"+(" "+idx.toString(10)).substr(-2) + "| " + mod.samples[idx].title + "</br>";
    }
    sampleText += getFooterRow([2, 24]) + "</br>";
    document.getElementById("samplelist").innerHTML = sampleText;
}

function rewind()
{
    audioOutput.rewind();
}

function play()
{
    audioOutput.play();
}

function pause()
{
    audioOutput.pause();
}

