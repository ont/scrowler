function Queue( acts ){
    this.acts = acts;
    this._sync = false;
}

Queue.prototype.animate = function( pos, delta ){
    for( var i in this.acts ){
        pos -= this.acts[ i ].animate( pos, delta );
        pos = ( pos < 0 ) ? 0 : pos;
    }
    return pos;
}

Queue.prototype.deinit = function(){
    for( var i in this.acts )
        this.acts[ i ].deinit();
}

Queue.prototype.len = function(){
    var s = 0;
    for( var i in this.acts )
        s += this.acts[ i ].len();
    this._len = s;
    return s;
}

Queue.prototype.bounds = function( s, e ){
    //console.log("Queue >>", s, e);
    /*
     * Calculate our real length.
     * If end bound is passed then we (or out parent is synced)
     */
    var _len = ( e ? e - s : this._len );

    for( var i in this.acts ) {
        var a = this.acts[ i ];
        if( e )
            /*
             * Pass stretched length to childs.
             * Calculate it as appropriate part of new total _len = (e' - s').
             *
             *      s              e
             * |----########****@@@@----> t   normal animation timeline (e is calculated by Queue)
             * |----####**@@------------> t   animation timeline when we are synced to (s', e')
             *      s'     e'
             *
             * # * @ -- three child animations
             *
             */
            a.bounds( s, s + a._len * _len / this._len );
        else
            a.bounds( s );  // we don't synced, do usual bound calculation

        s += _len * a._len / this._len;  // increase marker by length of (possibly) stretched child
    }
}

Queue.prototype.sync = function(){
    this._sync = true;
    return this;
}

function Parallel( acts ){
    this.acts = acts;
    this._sync = false;
}

Parallel.prototype.sync = function(){
    this._sync = true;
    return this;
}

Parallel.prototype.animate = function( pos, delta ){
    //console.log($(window).scrollTop());
    var m = 0;
    for( var i in this.acts )
        if( this.acts[ i ]._sync ){
            var k = this.acts[ i ]._len / this._len;
            this.acts[ i ].animate( pos * k, delta );  // do not change "m", one of all _must_ be non-sync
        } else {
            m = Math.max( m, this.acts[ i ].animate( pos, delta ) );
        }

    return m;
}

Parallel.prototype.deinit = Queue.prototype.deinit;

Parallel.prototype.len = function() {
    this._len = 0;

    for( var i in this.acts ) {
        var len = this.acts[ i ].len();  // always call len() calculation process
        if( !this.acts[ i ]._sync )      // .. but take into account only rigid (non-fluid, non-sync) acts
            this._len = Math.max( this._len, len );
    }

    return this._len;
}

/*
 * Calculates bounds for parallel container.
 * See Queue.prototype.bounds for more info about sync stuff
 */
Parallel.prototype.bounds = function( s, e ){
    var _len = ( e ? e - s : this._len );
    for( var i in this.acts ) {
        var a = this.acts[ i ];
        if( !a._sync )  // child is not synced
            if( !e ) a.bounds( s );                             // box is not synced
            else a.bounds( s, s + a._len * _len / this._len );  // box is synced --> child also becomes stretched
        else
        {
            a.bounds( s, s + _len );
        }
    }
}


function Anim( sel, elem, name, init, deinit, actor, args ){
    this._elem  = elem;     // animated element returned by $(sel)
    this._name  = name;     // .. plugin name, also for locks
    this._actor = actor;    // function which animates elem
    this._init  = init;     // function for preparing elem for animation
    this._args  = args;     // args which was passed during plugin call (in config tree)
    this._sync  = false;    // true - this anim is synced to another in parallel box
    this._len   = null;     // this length of animation
    this._start = null;     // scroll position when we start
    this._end   = null;     // scroll position when we finish animation
    this._snap  = false;    // true - snap to start/end of this animation when we inside it
    this._hash  = null;     // name of #hash in url which is associated with this anim

    /*
     * Create morph object for dealing with CSS 'transform' property — it
     * doesn't have separate properties, like transform-rotate, which could be
     * animated independently.
     */
    this._morph = {
        ux: 'px',  // units for translations
        uy: 'px',  // ..
        dx: null,  // translation delta (null indicates nontouched property)
        dy: null,  // ..
        r: null,   // rotation (always in degree)
        s: null,   // scale
    };

    function XPath( elem ){
        if( elem.id !== '' )
            return 'id("' + elem.id + '")';
        if( elem === document.body )
            return elem.tagName;

        var ix = 0,
            cs = elem.parentNode.childNodes;
        for( var i= 0; i < cs.length; i++ ){
            var c = cs[ i ];
            if( c === elem )
                return XPath( elem.parentNode ) + '/' + elem.tagName + '[' + ( ix + 1 ) + ']';
            if( c.nodeType === 1 && c.tagName === elem.tagName )
                ix++;
        }
    }

    /// convert DOM and jquery objects to XPath (this._sel must be string
    if( typeof sel === 'object' )
        sel = XPath( $( sel )[ 0 ] );

    this._sel = sel;
    Anim._dom[ this._sel ] = elem;

    if( typeof deinit === 'function' ){
        var def_deinit = this.deinit;
        this.deinit = function(){
            def_deinit();
            deinit( this._elem );
        }
    }
}

//Anim._iscroll = 0;   // global iscroll offset
Anim._dom = {};        // cache of {selector -> DOM element} binds
Anim._morphs = {};     // cache of morphs
Anim._hash = {};       // cache of {#hashname -> pos}
Anim._degrade = null;  // Animation degrade condition


Anim.prototype.init = function(){
    this._len = this._init.apply( this, this._args );
    return this;
}

Anim.prototype.animate = function( pos, delta ){
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


    var _pos = ( pos > this._len ) ? this._len : pos;
    var per = _pos / this._len;

    // form data to actor (position data + setup data)
    var args = [
        this._args[ 0 ],    // element to animate
        this._morph,        // special object for CSS 'transform' property
        per,                // percent of animation
        _pos                // current position in animation in px
    ].concat( this._args.slice( 1 ) ); // .. and append this data to setup options

    this._actor.apply( this, args );
    this.bake();

    // snap test
    if( this._snap ) {
        if( 0.2 < per && per < 0.8 && delta > 0 )
            Anim._snap = this._end;

        if( 0.2 < per && per < 0.8 && delta < 0 )
            Anim._snap = this._start;
    }

    return _pos;
}

Anim.prototype.deinit = function(){
    if( this._elem )
        this._elem.css( 'transform', 'none' );
}

/*
 * Bake morphs into CSS 'transform' property values
 */
Anim.prototype.bake = function(){
    var tmp = '';
    if( this._morph.dx != null ) tmp += 'translate3d(' + Math.round( this._morph.dx ) + this._morph.ux + ',0,0) ';
    if( this._morph.dy != null ) tmp += 'translate3d(0, ' + Math.round( this._morph.dy ) + this._morph.uy + ',0) ';
    if( this._morph.r  != null ) tmp += 'rotate3d(0,0,1,' + this._morph.r.toFixed( 2 ) + 'deg) ';
    if( this._morph.s  != null ) tmp += 'scale3d(' + this._morph.s.toFixed( 2 ) + ',' + this._morph.s.toFixed( 2 ) + ',1)';

    // touch CSS only if tmp is not empty
    if( tmp ){
        if( ! Anim._morphs[ this._sel ] )
            Anim._morphs[ this._sel ] = [];
        Anim._morphs[ this._sel ].push( tmp );
    }
}

Anim.prototype.len = function( pos ){
    if( !this._len )
        this.init();  // prepare DOM and calculate animation length

    return this._len;
}

/*
 * Calculates and saves bounds for Anim node.
 * See Queue.prototype.bounds for more info about sync stuff
 */
Anim.prototype.bounds = function( s, e ){
    this._start = s;                      // save start position of our animation
    this._end = (e ? e : s + this._len);  // if we are synced then save actual end position

    if( this._hash ) {
        var pos = this._end;

        if( this._hash_off == 'start+window' )
            pos = this._start + $(window).height();

        Anim._hash[ this._hash ] = pos - 1;
    }
}

Anim.prototype.sync = function(){
    this._sync = true;
    return this;
}

Anim.prototype.snap = function(){
    this._snap = true;
    return this;
}

Anim.prototype.hash = function( name, offset ){
    this._hash = name;        // save hash name for anim
    this._hash_off = offset;  // save optional hash offset
    return this;
}

function Skr(){
    this.tree = null;
    this.conf = null;
    this.pos = 0;  // last animation position passed to Skr.animate
}

Skr.prototype.len = function(){
    var len = this.tree.len( 0 ) + window.innerHeight;
    this.tree.bounds( 0 );  // calculate _start and _end for each Anim
    return len;
}

//Skr.prototype.func_parse = function( func ){
//    /*
//     * Regular expressions are taken from AngularJS
//     * See: http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
//     */
//    var FN_ARGS = /^(function\s*[^\(]*)\(\s*([^\)]*)\)/m;
//    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
//    func = func.toString().replace( STRIP_COMMENTS, '' );
//    args = func.match( FN_ARGS )[2];
//    args = args.split( ',' );
//    res = {}
//
//    // parse each arg and extract default value
//    var arg;
//    while( arg = args.pop() ) {
//        if( arg.match('=') ) {
//            var pair = arg.split('=');
//            res[ pair[0].trim() ] = eval( pair[1].trim() );
//        } else {
//            res[ arg.trim() ] = null;
//        }
//    }
//
//    // get keys of array (names of func's args)
//    args = [];
//    for( arg in res )
//        args.push( arg );
//
//    return [
//        // recompile func without default values
//        // see: http://stackoverflow.com/questions/1271516/executing-anonymous-functions-created-using-javascript-eval
//        eval('false||' + func.replace( FN_ARGS, '$1(' + args.join(',') +')' )),
//        // send default values as separate item
//        res
//   ];
//}

Skr.prototype.config = function( conf ){
    if( this.conf )
        for( var name in conf )
            this.conf[ name ] = conf[ name ];
    else
        this.conf = conf;
}

Skr.prototype.plugin = function( plug ){
    //var _methods = {};

    // parse custom plugin methods to anim object (they can be called in config)
    //var bl = { 'name': true, 'init': true, 'actor': true };  // black list of names
    //for( var name in plug )
    //    if( !( name in bl ) ){
    //        _methods[ name ] = this.func_parse( plug[ name ] );
    //    }

    var init = function( sel ) {
        var elem = $( sel );
        elem._selector = sel;  // save selector for later usage

        //
        // arguments == ['selector', opt1, opt2, opt3]
        // args == [elem, opt1, opt2, opt3]
        //
        var args = [ elem ].concat( Array.prototype.slice.call( arguments, 1 ) );

        // pack elem, init and actor to Anim object
        var anim = new Anim( sel, elem, plug.name, plug.init, plug.deinit, plug.actor, args );

        // add parsed custom plugin methods to anim
        //for( var name in _methods ) {
        //    // wrap function without default values for args
        //    anim[ name ] = function(){
        //        _methods[ name ][ 0 ].apply( anim, arguments );
        //        return anim;
        //    }
        //
        //    // setup default values for passed args in anim object
        //    var defs = _methods[ name ][ 1 ];
        //    for( var vname in defs )
        //        anim[ vname ] = defs[ vname ];
        //}

        //
        // set smooth animation
        //
        //elem.css( 'transition', 'transform ' +
        //            this.conf.trans_time + 'ms ' +
        //            this.conf.trans_func + ' 0ms' );
        //elem.css( '-webkit-transition', '-webkit-transform ' +
        //            this.conf.trans_time + 'ms ' +
        //            this.conf.trans_func + ' 0ms' );

        return anim;  // return anim obj which will be injected in config tree
    }
    skr[ plug.name ] = init;
};

/*
 * Animate all actors one by one
 */
Skr.prototype.queue = function( acts ){
    var frame = new Queue( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all actors independently
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
    // call onscroll event listener
    this.conf.onscroll( pos, pos - this.pos );

    Anim._locks = {};    // remove all locks
    Anim._morphs = {};   // reset all transformations
    Anim._snap = null;   // reset snap position
    Anim._degrade = ! ( 'ontouchstart' in window ) &&
                    window.innerWidth * window.innerHeight > this.conf.degrade_width * this.conf.degrade_height;

    this.tree.animate( pos, pos - this.pos );  // animate to target position
    this.pos = pos;   // save old pos for onscroll

    for( var i in Anim._morphs ) {
        var elem = Anim._dom[ i ];
        elem.css( "transform", Anim._morphs[ i ].join( " " ) );
    }

    // signal about possible #hash changes
    for( h in Anim._hash )
        if( Anim._hash[ h ] <= pos ) {
            owlet.hash( h );
        }
};

/*
 * Deinitialize scrowler
 */
Skr.prototype.deinit = function(){
    if( this.tree )
        this.tree.deinit();
}

/*
 * Syntax sugar for saving handler in config.
 */
Skr.prototype.onscroll = function( func ){
    this.conf.onscroll = func;
}

var skr = new Skr();

skr.config({
    'trans_time': 180,         // Transition duration in ms
    'trans_func': 'ease-out',  // Transition timing function
    'onscroll': function(){},  // onscroll listener (no-op by default)
    'degrade_width': 1280,     // Animation degrade condition (from CSS 'transform' to 'position')
    'degrade_height': 1024,
});

skr.plugin({
    'name': 'slide',
    'init': function( elem, type ){
        // setup size
        elem.css( 'height', window.innerHeight );

        // setup delay
        this.delay = 200;

        // hide element
        this.top = 100;                    // offset in percents for top
        elem.css( 'position', 'fixed' );   // .. relative to window

        this.h = elem[ 0 ].offsetHeight;

        if( type == 'first' ){
            this.h -= window.innerHeight;  // decrease animation length
            this.top = 0;                    // .. and don't hide first slide
        }

        elem.css( 'top', this.top + '%' );

        // remove any previous transforms from element
        if( Anim._degrade )
            elem.css( 'transform', 'none' );

        return this.h + this.delay;
    },
    'actor': function( elem, m, per, pos ){
        //m.dy = Math.max( -pos, -this.h );
        if( Anim._degrade )
            elem.css( 'top', 'calc(' + this.top + '% - ' + Math.min( pos, this.h ) + 'px)' );
        else
            m.dy = Math.max( -pos, -this.h );
    },
    'deinit': function( elem ){
        // TODO: 'relative' value may broke the layout
        elem.css({
            top: 'auto',
            position: 'relative',
            height: 'auto'
        });
    }
});

skr.plugin({
    'name': 'rotate',
    'init': function( elem, sang, eang, len ){
        return len;
    },
    'actor': function( elem, m, per, pos, sang, eang ){
        m.r = sang + ( eang - sang ) * per;
    }
});

skr.plugin({
    'name': 'pin',
    'init': function( elem, pos, len, baseline ){
        this.p = pos;

        this.bl = 0;
        if( baseline == 'center' )
            this.bl = elem.outerHeight() / 2 | 0;
        if( baseline == 'bottom' )
            this.bl = elem.outerHeight();

        return len;
    },
    'actor': function( elem, m, per, pos ){
        if( pos > this.p + this.bl )
            m.dy = pos - this.p - this.bl;
    }
});

skr.plugin({
    'name': 'scale',
    'init': function( elem, sscl, escl, len ){
        return len;
    },
    'actor': function( elem, m, per, pos, sscl, escl ){
        m.s = sscl + ( escl - sscl ) * per;
    }
});

/*
 * Function to extract value and units from string.
 * TODO: move this to Scrowler class ?
 */
function unit( x ){
    x = x.toString();
    var r_p = /%$/,
        r_px = /px$/;

    if( x.search( r_p ) != -1 )
        return [ parseFloat( x.replace( r_p,  '' ) ), '%' ];

    return [ parseFloat( x.replace( r_px, '' ) ), 'px' ];
}

skr.plugin({
    'name': 'move',
    'init': function( elem, dx_dy, len ){
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
    }
});

skr.plugin({
    'name': 'move_x',
    'init': function( elem, s, e, len ){
        this.s = unit( s );
        this.e = unit( e );

        if( this.s[ 1 ] != this.e[ 1 ] )
            throw 'Start and end values have different units';

        return len;
    },
    'actor': function( elem, m, per, pos ){
        m.dx = this.s[ 0 ] + (this.e[ 0 ] - this.s[ 0 ]) * per;
        m.ux = this.s[ 1 ];   // setup units
    }
});

skr.plugin({
    'name': 'move_y',
    'init': function( elem, s, e, len ){
        this.s = unit( s );
        this.e = unit( e );

        if( this.s[ 1 ] != this.e[ 1 ] )
            throw 'Start and end values have different units';

        return len;
    },
    'actor': function( elem, m, per, pos ){
        m.dy = this.s[ 0 ] + (this.e[ 0 ] - this.s[ 0 ]) * per;
        m.uy = this.s[ 1 ];   // setup units
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
    'deinit': function( elem ){
        elem.css( 'opacity', 1 );
    }
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

skr.plugin({
    'name': 'class',
    'init': function( elem ){
        return 1;
    },
    'actor': function( elem, m, per, pos, klass ){
        if( pos )
            elem.addClass( klass );
        else
            elem.removeClass( klass );
    },
});

//skr.plugin({
//    'name': 'hash',
//    'init': function( elem, offset ){
//        Anim._hash[ elem._selector ] = this._end;
//        return 1;
//    },
//    'actor': function( elem, m, per, pos ){
//        if( pos ) {
//            owlet.hash(this.name);  // set hash without jumping to it
//        }
//    },
//});
