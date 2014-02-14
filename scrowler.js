function One( acts ) {
    this.acts = acts;
    this._sync = false;
}

One.prototype.fly = function( pos ) {
    for( i in this.acts ) {
        pos -= this.acts[i].fly(pos);
        pos = ( pos < 0 ) ? 0 : pos;
    }
    return pos;
}

One.prototype.len = function( pos ) {
    var s = 0;
    for( i in this.acts )
        s += this.acts[i].len();
    this._len = s;
    return s;
}

One.prototype.sync = function() {
    this._sync = true;
    return this;
}

function All( acts ) {
    this.acts = acts;
    this._sync = false;
    this.len();  // calculate this._len
                 // (to avoid problems when we are root group)
}

All.prototype.sync = function() {
    this._sync = true;
    return this;
}

All.prototype.fly = function( pos ) {
    var m = 0;
    for( i in this.acts )
        if( this.acts[i]._sync ) {
            var k = this.acts[i]._len / this._len;
            this.acts[i].fly( pos * k );  // do not change "m", one of all _must_ be non-sync
        }
        else
            m = Math.max( m, this.acts[i].fly(pos) );

    return m;
}

All.prototype.len = function( pos ) {
    this._len = 0;

    for( i in this.acts )
        if( !this.acts[i]._sync )   // take into account only rigid (non-fluid, non-sync) acts
            this._len = Math.max( this._len, this.acts[i].len() );

    return this._len;
}

function Anim( init, actor, args ) {
    this._actor = actor;
    this._init = init;
    this._args = args;
    this._sync = false;
}

Anim.prototype.init = function() {
    this._len = this._init.apply(this, this._args);
    return this;
}

Anim.prototype.fly = function( pos ) {
    var d = (pos > this._len) ? this._len : pos;   // delta

    // form data to actor (position data + setup data)
    var args = [
        this._args[0],               // element to animate
        d / this._len,               // percent of animation
        d                            // current position in animation in px
    ].concat(this._args.slice(1));   // .. and append this data to setup options

    this._actor.apply(this, args);
    return d;
}

Anim.prototype.len = function() {
    return this._len;
}

Anim.prototype.sync = function() {
    this._sync = true;
    return this;
}

function Skr(){
    this.tree = null;
}

Skr.prototype.plugin = function( plug ){
    var init = function( sel ) {
        var elem = $(sel);

        //
        // arguments == ['selector', opt1, opt2, opt3]
        // args == [elem, opt1, opt2, opt3]
        //
        var args = [elem].concat( Array.prototype.slice.call( arguments, 1 ) );
        var anim = new Anim( plug.init, plug.actor, args );

        //
        // set smooth animation
        //
        elem.css('transition', 'transform 180ms ease-out 0ms');
        elem.css('transition', '-webkit-transform 180ms ease-out 0ms');
        return anim.init();
    }
    skr[ plug.name ] = init;
};

/*
 * Animates all actors one by one
 */
Skr.prototype.one = function( acts ){
    var frame = new One( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animates all actors in parallel
 */
Skr.prototype.all = function( acts ){
    var frame = new All( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all frames to given pos
 */
Skr.prototype.fly = function( pos ){
    this.tree.fly( pos );
};

var skr = new Skr();
skr.plugin({
    'name': 'slide',
    'init': function(elem, type) {
        // hiding element
        elem.css('position', 'fixed');
        elem.css('top', '100%');
        elem.css('height', $(window).height());

        var h = elem.outerHeight();
        if( type == 'first' ) {
            h -= $(window).height();
            elem.css('top', '0');
        }

        return h;
    },
    'actor': function(elem, per, pos) {
        elem.css('transform', 'translate(0,-' + pos + 'px)');
    }
});

skr.plugin({
    'name': 'rotate',
    'init': function(elem, sang, eang, len) {
        elem.css('transform', 'rotate(' + sang + 'deg)');
        return len;
    },
    'actor': function(elem, per, pos, sang, eang ) {
        elem.css('transform', 'rotate(' + (sang + (eang - sang) * per) + 'deg)');
    }
});

skr.plugin({
    'name': 'move',
    'init': function(elem, dx_dy, len ) {
        function unit( x ) {
            x = x.toString();
            var r_p = /%$/;
            var r_px = /px$/;
            if( x.search(r_p)  != -1 )
                return [ x.replace(r_p,  ''), '%' ];
            return [ x.replace(r_px, ''), 'px' ];
        }
        this.dx_dy = [ unit(dx_dy[0]), unit(dx_dy[1]) ];  // save parsed deltas
        return len;
    },
    // here we don't use "dx_dy" and "len" options, we use parsed "this.dx_dy"
    'actor': function(elem, per, pos) {
        elem.css('transform', 'translate('+ this.dx_dy[0][0] * per + this.dx_dy[0][1] + ','
                                          + this.dx_dy[1][0] * per + this.dx_dy[1][1] + ')');
    }
});


// $('#section2, #section3').css('height', $(window).height());
//
// skr.one([
//     skr.slide('#section2',1,2,'a'),
//     skr.slide('#section3'),
//     //skr.all(['anim2-lhand', 'anim2-rhand', 'anim2-ipad']),
//     //skr.all(['anim2-hidehands', 'anim2-showipad']),
// ]);
