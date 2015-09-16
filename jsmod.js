// JSmod JavaScript MOD player
// Copyright (C) 2011-2015 A.T.Brask <atbrask@gmail.com>

/////////////////
//             //
//  Constants  //
//             //
/////////////////

PALCLOCK  = 7093789.2; // Hz (PAL Amiga clock)
NTSCCLOCK = 7159090.5; // Hz (NTSC Amiga clock)

// Protracker-compatible lookup tables for vibrato and tremolo
LOOKUP = [[0, 24, 49, 74, 97,120,141,161,
           180,197,212,224,235,244,250,253,
           255,253,250,244,235,224,212,197,
           180,161,141,120, 97, 74, 49, 24,
           0, -24, -49, -74, -97,-120,-141,-161,
           -180,-197,-212,-224,-235,-244,-250,-253,
           -255,-253,-250,-244,-235,-224,-212,-197,
           -180,-161,-141,-120, -97, -74, -49, -24], // Sinusoid

          [252, 244, 236, 228, 220, 212, 204, 196,
           188, 180, 172, 164, 156, 148, 140, 132,
           124, 116, 108, 100, 92, 84, 76, 68,
           60, 52, 44, 36, 28, 20, 12, 4,
           -4, -12, -20, -28, -36, -44, -52, -60,
           -68, -76, -84, -92, -100, -108, -116, -124,
           -132, -140, -148, -156, -164, -172, -180, -188,
           -196, -204, -212, -220, -228, -236, -244, -252], // Ramp down

          [255, 255, 255, 255, 255, 255, 255, 255,
           255, 255, 255, 255, 255, 255, 255, 255,
           255, 255, 255, 255, 255, 255, 255, 255,
           255, 255, 255, 255, 255, 255, 255, 255,
           -255, -255, -255, -255, -255, -255, -255, -255,
           -255, -255, -255, -255, -255, -255, -255, -255,
           -255, -255, -255, -255, -255, -255, -255, -255,
           -255, -255, -255, -255, -255, -255, -255, -255], // Square

          [-100, 253, 104, -186, -241, -176, -90, -87,
           -110, -117, 207, -132, -28, -225, 142, -166,
           147, -185, -82, -187, -246, 126, -64, 170,
           241, -131, 199, 219, -108, -124, 50, 178,
           58, -236, -95, -238, 110, 192, 163, 146,
           246, -192, -117, 189, -49, -112, -226, -121,
           -162, -175, 211, -209, 64, -42, -81, 129,
           181, -179, 35, -62, 216, 27, 33, 102]]; // rAnDoM

/////////////////////////
//                     //
//  Utility functions  //
//                     //
/////////////////////////

// Converts an array of ASCII values into a string
function bytes2string(bytearray)
{
    size = bytearray.length;
    output = "";
    for (i = 0; i < size; i++)
        if (bytearray[i] != 0)
            output += String.fromCharCode(bytearray[i]);
    return output;
}

// Converts a signed byte to a float with the range -1..1
function bytes2floats(c)
{
    var d = c & 255;
    if (d < 128)
        return d / 128.0;
    else
        return (d - 256) / 128.0;
}

// Converts two bytes to a 16 bit uint
function bytes2int(hi,lo)
{
    return ((hi & 0xff) << 8) | (lo & 0xff);
}

// Takes the lower 4 bits and returns a signed value
function nibble2signed(nibble)
{
    if ((nibble & 0x8) == 0)
        return nibble & 0x7;
    else
        return (nibble & 0x7) - 8;
}

// Returns the high nibble of a byte value
function highnibble(x)
{
    return (x & 0xf0) >> 4;
}

// Returns the low nibble of a byte value 
function lownibble(x)
{
    return (x & 0x0f);
}

////////////////////
//                //
//  Audio buffer  //
//                //
////////////////////

// Circular buffer that returns data chunks of a specific length
function buffer(chunksize)
{
    this.chunksize = chunksize;
    this.buffersize = 32 * chunksize;
    this.chunk = new Float32Array(this.chunksize);
    this.data = new Float32Array(this.buffersize);
    this.reset();
}

buffer.prototype.reset = function()
{
    this.start = 0
    this.end = 0;
}

buffer.prototype.add = function(newdata, size)
{
    for (var i = 0; i < size; i++)
    {
        this.data[this.end] = newdata[i];
        this.end++;
        if (this.end >= this.buffersize)
            this.end -= this.buffersize;
    }
}

buffer.prototype.chunkready = function()
{
    if (this.start <= this.end)
        return this.end - this.start >= this.chunksize;
    else
        return this.end + this.buffersize - this.start >= this.chunksize;
}

buffer.prototype.update = function()
{
    this.updateOffset(this.chunksize);
}

buffer.prototype.updateOffset = function(samples)
{
    if (this.chunkready())
    {
        for(var i = 0; i < this.chunksize; i++)
        {
            if (samples + i < this.chunksize)
                this.chunk[i] = this.chunk[samples + i];
            else
            {
                this.chunk[i] = this.data[this.start];
                this.start++;
                if (this.start >= this.buffersize)
                    this.start -= this.buffersize;
            }
        }
    }
}

/////////////////////
//                 //
//  Module loader  //
//                 //
/////////////////////

function module(filedata)
{
    // Set title
    this.title = bytes2string(filedata.slice(0, 20));

    // Set pattern table
    var idx = 950;
    this.songlength = filedata[idx];
    idx += 2;
    this.patterntable = filedata.slice(idx, idx + 128);
    idx += 128;
    this.format = bytes2string(filedata.slice(idx, idx + 4));
    idx += 4;

    // Deduce channel count
    if (this.format == "M.K." || this.format == "M!K!" || this.format == "FLT4")
        this.channelcount = 4;
    else if (this.format == "FLT8")
        this.channelcount = 8;
    else if (this.format.match("CHN$") == "CHN") // if format.endswith("CHN")
    {
        this.channelcount = parseInt(this.format.slice(0, 1), 10);
        if (isNaN(this.channelcount))
            this.channelcount = 0;
    }
    else if (this.format.match("CH$") == "CH") // if format.endsWith("CH")
    {
        this.channelcount = parseInt(this.format.slice(0, 2), 10);
        if (isNaN(this.channelcount))
            this.channelcount = 0;
    }
    else
        this.channelcount = 0; // Unsupported format

    // Patterns
    this.patterncount = Math.max.apply(null, this.patterntable);
    this.patterns = [];
    for (var i = 0; i <= this.patterncount; i++)
    {
        // The size of a pattern is 256 bytes per channel times channel count
        this.patterns[i] = new modpattern(filedata.slice(idx, idx + 256 * this.channelcount));
        idx += 256 * this.channelcount;
    }

    // We need an extra data pointer now because samples are described
    // in the beginning of the file while the actual data is towards the end.
    var samplestart = idx;
    idx = 20;

    // Samples (assume that we have 31 samples)
    this.samples = [];
    for (var i = 1; i < 32; i++)
    {
        this.samples[i] = new modsample(i, filedata, idx, samplestart);
        idx += 30;
        samplestart += this.samples[i].length;
    }
}

///////////////
//           //
//  Pattern  //
//           //
///////////////

function modpattern(data)
{
    this.channels = [];
    var channelcount = data.length / 256;
    for (var i = 0; i < channelcount; i++)
        this.channels[i] = new modchannel(data, i, channelcount);
}

///////////////
//           //
//  Channel  //
//           //
///////////////

function modchannel(data, channel, totalchannels)
{
    this.samples = [];
    this.periods = [];
    this.effects = [];

    for(var row = 0; row < 64; row++)
    {
        var pos = (channel + (row * totalchannels)) * 4;
        this.samples[row] =  (highnibble(data[pos]) << 4) | highnibble(data[pos+2]);
        this.periods[row] =   (lownibble(data[pos]) << 8) | (0xff & data[pos + 1]);
        this.effects[row] = (lownibble(data[pos+2]) << 8) | (0xff & data[pos + 3]);
    }
}

modchannel.prototype.noteString = function(idx)
{
    var period = this.periods[idx];
    if (period == 0)
        return "...";

    var notes = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
    var baseperiod = [107, 101, 95, 90, 85, 80, 76, 71, 67, 64, 60, 57];

    // Determine octave
    var octave = 0;
    if (period < 55)
        octave = 5
    else if (period < 110)
        octave = 4;
    else if (period < 220)
        octave = 3;
    else if (period < 440)
        octave = 2;
    else if (period < 880)
        octave = 1;

    // Determine note
    var note = "XX";
    for (var i = 0; i < 12; i++)
    {
        var p = Math.floor(period / (Math.pow(2, 4-octave)));
        if (p >= baseperiod[i]-1 && p <= baseperiod[i]+1)
            note = notes[i];
    }

    return note+octave;
}

modchannel.prototype.sampleString = function(idx)
{
    var sample = this.samples[idx];
    if (sample == 0)
        return "..";
    var result = sample.toString(16);
    if (result.length == 1)
        result = "0" + result;
    return result;

}

modchannel.prototype.effectString = function(idx)
{
    var effect = this.effects[idx];
    var e = (effect & 0xf00) >> 8;
    var x = (effect & 0x0f0) >> 4;
    var y = (effect & 0x00f);
    var result = ".";
    if (e != 0)
        result = e.toString(16);
    return result + x.toString(16) + y.toString(16);
}

//////////////
//          //
//  Sample  //
//          //
//////////////

function modsample(no, data, metapointer, audiopointer)
{
    this.no = no;
    this.title = bytes2string(data.slice(metapointer, metapointer + 22));
    this.length = 2 * bytes2int(data[metapointer + 22], data[metapointer + 23]);
    this.finetune = nibble2signed(data[metapointer + 24]);
    this.volume = data[metapointer + 25];
    this.repeatstart = 2 * bytes2int(data[metapointer + 26], data[metapointer + 27]);
    this.repeatlength = 2 * bytes2int(data[metapointer + 28], data[metapointer + 29]);
    this.repeats = (this.repeatlength > 2);
    this.audio = data.slice(audiopointer, audiopointer + this.length).map(bytes2floats);
}

/////////////////
//             //
//  Sequencer  //
//             //
/////////////////

function modsequencer(mod, mixer, crossmix, samplerate)
{
    this.module = mod;
    this.mixer = mixer;
    this.crossmix = crossmix;
    this.samplerate = samplerate;
    this.updateEvent = new CustomEvent("sequencer-update")
    this.reset();
}

modsequencer.prototype.reset = function()
{
    // Standard start settings
    this.speed = 6;
    this.bpm = 125;
    this.nextstartrow = 0;
    this.startrow = 0;
    this.playing = true;
    this.currentpatternindex = -1;
    this.currentpattern = undefined;
    this.loopstart = 0;
    this.loopcount = 0;
    this.patternrow = -1;
    this.patternsetrow = 0;
    this.delay = 0;
    this.repeat = 1;
    this.done = false;
    // Tell everyone!
    document.dispatchEvent(this.updateEvent);
}

modsequencer.prototype.update = function()
{
    if (!this.playing)
        return;

    // Update current pattern?
    if (this.repeat >= this.delay * this.speed)
    {

        // ..or even move to new pattern?
        if (this.patternrow < 0 || this.patternrow > 63)
        {
            this.currentpatternindex++;

            if (this.currentpatternindex >= this.module.songlength)
                this.done = true;

            this.currentpattern = this.module.patterns[this.module.patterntable[this.currentpatternindex]];
            this.patternrow = this.nextstartrow; // This is to support jumps
            this.nextstartrow = 0;
            this.loopstart = 0;
            this.loopcount = -1;
            this.repeat = 0;
        }

        this.updaterow();

        // Tell everyone!
        document.dispatchEvent(this.updateEvent);
    }

    if (this.repeat < this.delay * this.speed);
    {
        this.mixer.updateAudioBuffer(2500 / this.bpm, this.crossmix, this.samplerate);
        this.repeat++;
    }
}

modsequencer.prototype.updaterow = function()
{
    var setrow = this.patternrow;
    this.delay = 1;
    // For each row we have a couple of channels
    for (var ch = 0; ch < this.module.channelcount; ch++)
    {
        var channel = this.currentpattern.channels[ch];
        this.mixer.channels[ch].settone(channel.periods[this.patternrow], channel.samples[this.patternrow], channel.effects[this.patternrow]);
        // A few effects are global and have to be handled here
        var effect = channel.effects[this.patternrow];

        // Bxy Jump to pattern
        if ((effect & 0xf00) == 0xb00)
        {
            setrow = 63;
            this.currentpatternindex = (effect & 0xff) - 1;
        }

        // Dxy Pattern break
        if ((effect & 0xf00) == 0xd00)
        {
            setrow = 63;
            this.nextstartrow = ((effect & 0xf0) >> 4) * 10 + (effect & 0xf);
        }

        // E6x Pattern loop
        if ((effect & 0xff0) == 0xe60)
        {
            var count = effect & 0xf;
            if (count == 0)
                this.loopstart = this.patternrow;
            else
            {
                if (this.loopcount == -1)
                  this.loopcount = count;
                this.loopcount--;
                if (this.loopcount > -1)
                    setrow = this.loopstart - 1;
            }
        }

        // EEx Delay pattern
        if ((effect & 0xff0) == 0xee0)
          this.delay = (effect & 0xf) + 1;

        // Fxy Set speed
        if ((effect & 0xf00) == 0xf00)
        {
            var newspeed = effect & 0xff;
            if (newspeed == 0)
                this.speed = 1;
            else if (newspeed <= 32)
                this.speed = newspeed;
            else
                this.bpm = newspeed;
        }
    }
    this.patternrow = setrow + 1;
    this.repeat = 0;
}

///////////////////
//               //
//  Audio mixer  //
//               //
///////////////////

function modaudiomixer(mod, crossmix, clock)
{
    var count = mod.channelcount;
    this.channels = []
    this.leftchannels = []
    this.rightchannels = []
    for (var i = 0; i < count; i++)
    {
        var newchannel = new modaudiochannel(mod, clock);
        this.channels.push(newchannel);
        if (i % 4 == 0 || i % 4 == 3)
            this.leftchannels.push(newchannel);
        else
            this.rightchannels.push(newchannel);
    }
    this.crossmix = crossmix;
    this.leftbuffer = new Float32Array(65536);
    this.rightbuffer = new Float32Array(65536);
    this.size = 0;
}

modaudiomixer.prototype.mixChannels = function(channels, buffer, ms, samplerate)
{
    for (var ch = 0; ch < channels.length; ch++)
        channels[ch].updateAudioBuffer(ms, samplerate);
    var len = channels[0].bufferlength;
    for (var i = 0; i < len; i++)
    {
        var value = 0;
        for (var ch = 0; ch < channels.length; ch++)
            value += channels[ch].buffer[i] / channels.length;
        buffer[i] = value;
    }
    return len;
}

modaudiomixer.prototype.updateAudioBuffer = function(ms, crossmix, samplerate)
{
    this.size = this.mixChannels(this.leftchannels, this.leftbuffer, ms, samplerate);
    this.mixChannels(this.rightchannels, this.rightbuffer, ms, samplerate);

    // Do crossmixing
    for (var i = 0; i < this.size; i++)
    {
        var left = this.leftbuffer[i];
        var right = this.rightbuffer[i];
        this.leftbuffer[i] = left * (1 - crossmix) + right * crossmix;
        this.rightbuffer[i] = right * (1 - crossmix) + left * crossmix;
    }
}

/////////////////////
//                 // 
//  Audio channel  //
//                 //
/////////////////////

function modaudiochannel(mod, clock)
{
    this.mod = mod;
    this.clock = clock;
    this.buffer = new Float32Array(65536);
    this.reset();
}

modaudiochannel.prototype.reset = function()
{
    // We have a lot of state variables...
    this.period = 0;
    this.effect = 0;
    this.volume = 0;
    this.tick = 0;

    this.tremolo = 0;
    this.tremolospeed = 0;
    this.tremolodepth = 0;
    this.tremolopos = 0;
    this.tremolowave = 0;

    this.vibrato = 0;
    this.vibratospeed = 0;
    this.vibratodepth = 0;
    this.vibratopos = 0;
    this.vibratowave = 0;

    this.portafrom = 0;
    this.portahidden = 0;
    this.portato = 0;
    this.portaspeed = 0;

    this.delayedperiod = 0;

    this.glissando = 0;
    this.arpeggio = 0;

    this.sample = undefined;
    this.bufferlength = 0;
}

modaudiochannel.prototype.settone = function(newperiod, newsample, neweffect)
{
    // Each row consists of a series of ticks
    this.tick = 0;
    this.arpeggio = 0;
    // If period == 0 or sample == 0 --> use existing value
    if (newperiod != 0)
    {
        // Delay note requires special care
        if ((neweffect & 0xff0) == 0xed0)
        {
            this.period = 0;
            this.delayedperiod = newperiod;
        }
        // Portamento requires special care
        else if (((neweffect & 0xf00) == 0x300) ||
                 ((neweffect & 0xf00) == 0x500))
        {
            this.portafrom = this.period;
            this.portahidden = 0;
            this.portato = newperiod;
        }
        else
        {
            this.index = 0.0;
            this.period = newperiod;
        }
        // Retriggering...
        if (this.tremolowave < 4)
            this.tremolopos = 0;
        if (this.vibratowave < 4)
            this.vibratopos = 0;
    }
    if (newsample != 0)
    {
        this.sample = this.mod.samples[newsample];
        this.volume = this.sample.volume;
    }
    // Effects are always updated
    this.effect = neweffect;
}

modaudiochannel.prototype.updateEffects = function()
{
    // Let's put all the bit-fiddling here
    var e  = (this.effect & 0xf00) >> 8;
    var ee = (this.effect & 0xff0) >> 4;
    var xy = (this.effect & 0x0ff);
    var x = (this.effect & 0x0f0) >> 4;
    var y = (this.effect & 0x00f);

    // "header format":
    // [code] [name] ([update on tick 0], [update on tick >0])

    // 0xy Arpeggio (N,Y)
    if ((e == 0) && this.tick > 0)
        if (this.tick % 3 == 1)
            this.arpeggio = x;
        else if (this.tick % 3 == 2)
            this.arpeggio = y;
        else
            this.arpeggio = 0;

    // 1xy Porta up (N,Y) (but not past B-3 == 113)
    if (e == 0x1)
        if (this.tick == 0)
            this.portaspeed = xy;
        else
            this.period = Math.max(113, this.period - this.portaspeed);

    // 2xy Porta down (N,Y) (but not past C-1 == 856)
    if (e == 0x2)
        if (this.tick == 0)
            this.portaspeed = xy;
        else
            this.period = Math.min(856, this.period + this.portaspeed);

    // 3xy Porta to note ((Y),Y) (5xy Combo: 3xy + Axy (N,Y))
    if (e == 0x3 && this.tick == 0 && xy != 0)
        this.portaspeed = xy;
    if ((e == 0x3 || e == 0x5) && this.tick > 0)
        if (this.glissando == 1)
        {
            if (this.period > this.portato)
            {
                this.portahidden -= this.portaspeed;
                var semitone = Math.ceil(Math.log(1+(this.portahidden/this.portafrom))/(Math.log(2))*12);
                this.period = Math.max(this.portato, this.portafrom * Math.pow(2, semitone/12.0));
            }
            else if (this.period < this.portato)
            {
                this.portahidden += this.portaspeed;
                var semitone = Math.floor(Math.log(1+(this.portahidden/this.portafrom))/(Math.log(2))*12);
                this.period = Math.min(this.portato, this.portafrom * Math.pow(2, semitone/12.0));
            }
        }
        else
        {
            if (this.period > this.portato)
                this.period = Math.max(this.portato, this.period - this.portaspeed);
            else if (this.period < this.portato)
                this.period = Math.min(this.portato, this.period + this.portaspeed);
        }

    // 4xy Vibrato (N,Y) (6xy Combo: 4xy + Axy (N,Y))
    if (e == 0x4 && this.tick == 0)
    {
        if (x > 0)
            this.vibratospeed = x;
        if (y > 0)
            this.vibratodepth = y;
    }
    if ((e == 0x4 && (this.tick > 0 || xy == 0)) || (e == 0x6 && (this.tick > 0)))
    {
        this.vibrato = (this.vibratodepth * LOOKUP[this.vibratowave % 4][this.vibratopos])/128;
        this.vibratopos = (this.vibratopos + this.vibratospeed) % 64;
    }
    else
        this.vibrato = 0;

    // 7xy Tremolo (N,Y)
    if (e == 0x7 && this.tick == 0)
    {
        if (x > 0)
            this.tremolospeed = x;
        if (y > 0)
            this.tremolodepth = y;
    }
    if (e == 0x7 && (this.tick > 0 || xy == 0))
    {
        this.tremolo = (this.tremolodepth * LOOKUP[this.tremolowave % 4][this.tremolopos])/64;
        this.tremolopos = (this.tremolopos + this.tremolospeed) % 64;
    }
    else
        this.tremolo = 0;


    // 8xy Pan (N,Y) UNSUPPORTED
    //if (e == 0x8 && this.tick == 0)

    // 9xy Sample offset (Y,N)
    if (e == 0x9 && this.tick == 0)
        this.index = xy * 256;

    // Axy Volume slide (N,Y) (5xy Combo: 3xy + Axy (N,Y) , 6xy Combo: 4xy + Axy (N,Y))
    if ((e == 0xa || e == 0x5 || e == 0x6) && this.tick > 0)
        if (x > 0 && y == 0) // up
            this.volume = Math.min(this.volume + x, 64);
        else if (x == 0 && y > 0) // down
            this.volume = Math.max(this.volume - y, 0);

    // Cxy Set volume (Y,N)
    if (e == 0xc && this.tick == 0)
        this.volume = Math.min(xy, 64);

    // E0x Set filter (Y,N) UNSUPPORTED
    //if (ee == 0xe0 && this.tick == 0)

    // E1x Fine porta up (Y,N)
    if (ee == 0xe1 && this.tick == 0)
        this.period -= y;

    // E2x Fine porta down (Y,N)
    if (ee == 0xe2 && this.tick == 0)
        this.period += y;

    // E3x Glissando control (Y,N)
    if (ee == 0xe3 && this.tick == 0)
        this.glissando = y;

    // E4x Vibrato waveform (Y,N)
    if (ee == 0xe4 && this.tick == 0)
        this.vibratowave = y;

    // E5x Set finetune (Y,N)
    if ((ee == 0xe5) && this.tick == 0 && this.sample != undefined)
        this.sample.finetune = nibble2signed(y);

    // E7x Tremolo waveform (Y,N)
    if (ee == 0xe7 && this.tick == 0)
        this.tremolowave = y;

    // E8x 16 pos panning (Y,N) UNSUPPORTED
    //if (ee == 0xe8 && this.tick == 0)

    // E9x Retrigger note (N,Y)
    if (ee == 0xe9 && this.tick > 0 && this.tick % y == 0)
        this.index = 0.0;

    // EAx Fine volslide up (Y,N)
    if (ee == 0xea && this.tick == 0)
        this.volume = Math.min(this.volume + y, 64);

    // EBx Fine volslide down (Y,N)
    if (ee == 0xeb && this.tick == 0)
        this.volume = Math.max(this.volume - y, 0);

    // ECx Cut note (N,Y)
    if (ee == 0xec && this.tick == y)
        this.volume = 0;

    // EDx Delay note (N,Y)
    if (ee == 0xed && this.tick == y)
    {
        this.index = 0.0;
        this.period = this.delayedperiod;
    }

    // EFx Invert loop (Y,N) UNSUPPORTED
    // if (ee == 0xef && this.tick == 0)

    // Update ticks
    this.tick++;

}

modaudiochannel.prototype.updateAudioBuffer = function(ms, samplerate)
{
    // Prepare stuff
    this.updateEffects();
    this.bufferlength = Math.floor(ms * samplerate / 1000.0);

    // Special cases...
    if (this.sample == undefined || this.period == 0)
    {
        for(var i = 0; i < this.bufferlength; i++)
            this.buffer[i] = 0;
        return;
    }

    // Take care of finetuning and arpeggio
    var tunedperiod = this.period * Math.pow(2, -(this.sample.finetune + (this.arpeggio * 8)) / 96.0);
    var srcsamples = (ms / 1000.0) * (this.clock / (tunedperiod * 2)) - this.vibrato;

    // Get instrument data
    var vol = Math.max(0, Math.min(64, this.volume + this.tremolo)) / 64.0;

    // Stretch + resample src -> dest (linear interpolation)
    for (var destidx = 0; destidx < this.bufferlength; destidx++)
    {
        var srcidx = destidx * (srcsamples / this.bufferlength) + this.index;
        var thisidx = Math.floor(srcidx);
        var nextidx = thisidx + 1;
        var fraction = srcidx - thisidx;

        if (this.sample.repeats)
        {
            if (thisidx >= this.sample.audio.length)
                thisidx = ((thisidx - this.sample.repeatstart) % this.sample.repeatlength) + this.sample.repeatstart;
            if (nextidx >= this.sample.audio.length)
                nextidx = ((nextidx - this.sample.repeatstart) % this.sample.repeatlength) + this.sample.repeatstart;
        }
        var nextpart = fraction * this.sample.audio[nextidx];
        var thispart = (1 - fraction) * this.sample.audio[thisidx];
        this.buffer[destidx] = ((isNaN(thispart) ? 0 : thispart) + (isNaN(nextpart) ? 0 : nextpart)) * vol;
    }
    this.index += srcsamples;
}
