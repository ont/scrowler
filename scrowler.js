function Queue( acts ){
    this.acts = acts;
    this._sync = false;
}

Queue.prototype.animate = function( pos ){
    for( var i in this.acts ){
        pos -= this.acts[ i ].animate( pos );
        pos = ( pos < 0 ) ? 0 : pos;
    }
    return pos;
}

Queue.prototype.len = function( pos ){
    var s = 0;
    for( var i in this.acts )
        s += this.acts[ i ].len();
    this._len = s;
    return s;
}

Queue.prototype.sync = function(){
    this._sync = true;
    return this;
}

function Parallel( acts ){
    this.acts = acts;
    this._sync = false;
    this.len();  // calculate this._len
                 // (to avoid problems when we are root group)
}

Parallel.prototype.sync = function(){
    this._sync = true;
    return this;
}

Parallel.prototype.animate = function( pos ){
    var m = 0;
    for( var i in this.acts )
        if( this.acts[ i ]._sync ){
            var k = this.acts[ i ]._len / this._len;
            this.acts[ i ].animate( pos * k );  // do not change "m", one of all _must_ be non-sync
        }
        else
            m = Math.max( m, this.acts[ i ].animate( pos ) );

    return m;
}

Parallel.prototype.len = function( pos ) {
    this._len = 0;

    for( var i in this.acts )
        if( ! this.acts[ i ]._sync )   // take into account only rigid (non-fluid, non-sync) acts
            this._len = Math.max( this._len, this.acts[ i ].len() );

    return this._len;
}

function Anim( sel, elem, name, init, actor, args ){
    this._sel = sel;    // original jquery selector in form of string (for locks)
    this._elem = elem;  // animated element returned by $(sel)
    this._name = name;  // .. plugin name, also for locks
    this._actor = actor;
    this._init = init;
    this._args = args;
    this._sync = false;

    /*
     * Create morph in central 'cache'.
     * Morphs are special subcache objectects for CSS 'transform' property.
     * Different plugins can change this obj to achieve complex animation.
     */
    if( Anim._morphs[ sel ] === undefined )
        Anim._morphs[ sel ] = {
            ux: 'px',      // units for translations
            uy: 'px',      // ..
            dx: null,      // translation delta (null indicates nontouched property)
            dy: null,      // ..
            r: null,       // rotation (always in degree)
            s: null,       // scale
            e: this._elem  // element to animate (used by Scrowler class)
        };
}

Anim._morphs = {};  // cache of morphs

Anim.prototype.init = function(){
    this._len = this._init.apply( this, this._args );
    return this;
}

Anim.prototype.animate = function( pos ){
    /*
     * Animate object at zero pos only if nobody was animated before.
     * Chart of some property of the object during animation:
     *
     * ^
     * |          *-----*
     * |         /       \
     * |        /         \
     * | ------*           *-------
     * |
     * +-------####-----####------------> t
     *   |     | p1       p2
     *   +-----+
     *      \_______ interpolation segment (here we call p1.animate(0))
     *
     * We must avoid calling p2.animate(0) after p1.animate(0).
     */

    locks = Anim._locks[ this._name ] || {};  // take named lock for plugin

    // we called with 0, check if we are first and can interpolate
    if( pos == 0 && locks[ this._sel ] )
        return 0;  // go away we are not first

    locks[ this._sel ] = true;                // add lock to selector
    Anim._locks[ this._name ] = locks;


    var delta = ( pos > this._len ) ? this._len : pos;

    // form data to actor (position data + setup data)
    var args = [
        this._args[ 0 ],             // element to animate
        Anim._morphs[ this._sel ],   // special obj for CSS 'transform' property
        delta / this._len,           // percent of animation
        delta                        // current position in animation in px
    ].concat( this._args.slice( 1 ) ); // .. and append this data to setup options

    this._actor.apply( this, args );

    return delta;
}

Anim.prototype.len = function(){
    return this._len;
}

Anim.prototype.sync = function(){
    this._sync = true;
    return this;
}

function Skr(){
    this.tree = null;
    this.conf = null;
}

Skr.prototype.config = function( conf ){
    this.conf = conf;
}

Skr.prototype.plugin = function( plug ){
    var init = function( sel ) {
        var elem = $( sel );

        //
        // arguments == ['selector', opt1, opt2, opt3]
        // args == [elem, opt1, opt2, opt3]
        //
        var args = [ elem ].concat( Array.prototype.slice.call( arguments, 1 ) );
        var anim = new Anim( sel, elem, plug.name, plug.init, plug.actor, args );

        //
        // set smooth animation
        //
        elem.css( 'transition', 'transform ' +
                    this.conf.trans_time + 'ms ' +
                    this.conf.trans_func + ' 0ms' );
        elem.css( '-webkit-transition', '-webkit-transform ' +
                    this.conf.trans_time + 'ms ' +
                    this.conf.trans_func + ' 0ms' );

        return anim.init();
    }
    skr[ plug.name ] = init;
};

/*
 * Burn all morphs under all elems into CSS 'transform'
 */
Skr.prototype.burn = function(){
    for( var i in Anim._morphs )
    {
        var m = Anim._morphs[ i ];
        var tmp = '';
        if( m.dx !== null ) tmp += 'translateX(' + m.dx + m.ux + ') ';
        if( m.dy !== null ) tmp += 'translateY(' + m.dy + m.uy + ') ';
        if( m.r  !== null ) tmp += 'rotate(' + m.r + 'deg) ';
        if( m.s  !== null ) tmp += 'scale(' + m.s + ') ';

        m.e.css( 'transform', tmp );
    }
}

/*
 * Animate all actors one by one
 */
Skr.prototype.queue = function( acts ){
    var frame = new Queue( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all actors simultaneously
 */
Skr.prototype.parallel = function( acts ){
    var frame = new Parallel( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all frames to the given pos
 */
Skr.prototype.animate = function( pos ){
    Anim._locks = {};          // remove all locks
    this.tree.animate( pos );  // animate to target position
    this.burn();               // burn all morphs into CSS
};

var skr = new Skr();

skr.config({
    'trans_time': 180,       // Transition duration in ms
    'trans_func': 'ease-out' // Transition timing function
});

skr.plugin({
    'name': 'slide',
    'init': function( elem, type ){
        // hiding element
        elem.css( 'position', 'fixed' );
        elem.css( 'top', '100%' );
        elem.css( 'height', $( window ).height() );

        var h = elem.outerHeight();

        if( type == 'first' ){
            h -= $( window ).height();
            elem.css( 'top', '0' );
        }

        return h;
    },
    'actor': function( elem, m, per, pos ){
        m.dy = -pos;
    }
});

skr.plugin({
    'name': 'rotate',
    'init': function( elem, sang, eang, len ){
        //elem.css( 'transform', 'rotate(' + sang + 'deg)' );
        return len;
    },
    'actor': function( elem, m, per, pos, sang, eang ){
        m.r = sang + ( eang - sang ) * per;
        //elem.css( 'transform', 'rotate(' +  + 'deg)' );
    }
});

skr.plugin({
    'name': 'move',
    'init': function( elem, dx_dy, len ){

        function unit( x ){
            x = x.toString();
            var r_p = /%$/,
                r_px = /px$/;

            if( x.search( r_p ) != -1 )
                return [ parseFloat( x.replace( r_p,  '' ) ), '%' ];

            return [ parseFloat( x.replace( r_px, '' ) ), 'px' ];
        }

        this.dx_dy = [ unit( dx_dy[ 0 ] ),
                       unit( dx_dy[ 1 ] ) ];  // save parsed deltas
        return len;
    },
    // here we don't use "dx_dy" and "len" options, we use parsed "this.dx_dy"
    'actor': function( elem, m, per, pos ){
        if( this.dx_dy[ 0 ][ 0 ] ) {
            m.dx = this.dx_dy[ 0 ][ 0 ] * per;
            m.ux = this.dx_dy[ 0 ][ 1 ];
        }
        if( this.dx_dy[ 1 ][ 0 ] ) {
            m.dy = this.dx_dy[ 1 ][ 0 ] * per;
            m.uy = this.dx_dy[ 1 ][ 1 ];
        }
        //elem.css( 'transform', 'translate(' + this.dx_dy[ 0 ][ 0 ] * per + this.dx_dy[ 0 ][ 1 ] + ','
        //                                    + this.dx_dy[ 1 ][ 0 ] * per + this.dx_dy[ 1 ][ 1 ] + ')' );
    }
});

skr.plugin({
    'name': 'fade',
    'init': function( elem, sop, eop, len ){
        elem.css( 'opacity', sop );
        return len;
    },
    'actor': function( elem, m, per, pos, sop, eop ){
        elem.css( 'opacity', sop + ( eop - sop ) * per );
    },
});

skr.plugin({
    'name': 'delay',
    'init': function( elem ){
        return elem[ 0 ];
    },
    'actor': function( elem, m, per, pos ){
        // no action
    },
});
